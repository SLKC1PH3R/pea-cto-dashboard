import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * Saisie/mise à jour manuelle du cours d'un actif suivi (watchlist), en
 * repli quand ni Finnhub ni boursorama.com ne couvrent sa place de
 * cotation (ex: ETC sur la London Stock Exchange).
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

  const existing = await prisma.watchlistItem.findFirst({
    where: { userId: session.user.id, ticker: ticker.trim().toUpperCase() },
  });
  if (!existing) {
    return NextResponse.json({ error: "Cet actif n'est pas dans ta liste de suivi" }, { status: 404 });
  }

  const item = await prisma.watchlistItem.update({
    where: { id: existing.id },
    data: { manualPrice: price, manualPriceAt: new Date() },
  });

  return NextResponse.json({
    ticker: item.ticker,
    manualPrice: item.manualPrice?.toNumber() ?? null,
    manualPriceAt: item.manualPriceAt?.toISOString() ?? null,
  });
}
