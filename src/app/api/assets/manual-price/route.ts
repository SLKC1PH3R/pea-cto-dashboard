import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * Permet de saisir/mettre à jour à la main le dernier cours connu d'un
 * actif — utilisé en repli quand Finnhub ne couvre pas sa place de
 * cotation (ex: ETF Euronext sur un plan gratuit). L'actif doit être
 * détenu par l'utilisateur connecté (pas de modification arbitraire).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json();
  const { ticker, price } = body as { ticker?: string; price?: number };

  if (!ticker || typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return NextResponse.json({ error: "ticker et price (nombre positif) requis" }, { status: 400 });
  }

  const owns = await prisma.position.findFirst({
    where: { asset: { ticker }, account: { userId: session.user.id } },
  });
  if (!owns) {
    return NextResponse.json({ error: "Actif introuvable dans ton portefeuille" }, { status: 404 });
  }

  const asset = await prisma.asset.update({
    where: { ticker },
    data: { manualPrice: price, manualPriceAt: new Date() },
  });

  return NextResponse.json({
    ticker: asset.ticker,
    manualPrice: asset.manualPrice?.toNumber() ?? null,
    manualPriceAt: asset.manualPriceAt?.toISOString() ?? null,
  });
}
