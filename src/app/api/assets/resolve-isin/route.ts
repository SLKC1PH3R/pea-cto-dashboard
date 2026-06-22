import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveAssetByIsin } from "@/lib/parsers/asset-mapping";
import { findTradingViewSymbolByIsin, toDisplayTicker } from "@/lib/tradingview-quote";

/**
 * Résout un ticker à partir d'un ISIN — table statique connue en priorité,
 * sinon recherche tradingview.com (couvre nettement mieux les fonds UCITS
 * PEA français que Finnhub). Utilisé par les formulaires de saisie manuelle
 * (transaction, DCA) pour éviter de deviner/taper le ticker à la main.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const isin = req.nextUrl.searchParams.get("isin")?.trim().toUpperCase();
  if (!isin || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) {
    return NextResponse.json({ error: "ISIN invalide" }, { status: 400 });
  }

  const known = resolveAssetByIsin(isin);
  if (known?.matched && known.asset.ticker) {
    return NextResponse.json({
      ticker: known.asset.ticker,
      name: known.asset.name,
      assetType: known.asset.assetType,
      currency: known.asset.currency,
    });
  }

  const sym = await findTradingViewSymbolByIsin(isin);
  if (!sym) {
    return NextResponse.json({ error: "Aucun résultat pour cet ISIN" }, { status: 404 });
  }
  return NextResponse.json({
    ticker: toDisplayTicker(sym),
    name: known?.matched ? known.asset.name : sym.description,
    assetType: known?.matched ? known.asset.assetType : undefined,
    currency: known?.matched ? known.asset.currency : sym.currency ?? undefined,
  });
}
