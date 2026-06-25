import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getYahooQuotes } from "@/lib/yahoo-quote";

/**
 * Endpoint déclenché par un scheduler externe (cron Dokploy, cron-job.org…)
 * — pas par un utilisateur connecté, donc protégé par un secret partagé
 * (`CRON_SECRET`, à définir comme variable d'environnement) plutôt que par
 * une session NextAuth. Capture le cours actuel (Yahoo Finance) de chaque
 * ticker réellement détenu ou suivi, une seule ligne par jour (upsert sur
 * ticker+date) — alimente `PriceHistory`, jusqu'ici une table déclarée mais
 * jamais écrite. Ne fabrique aucun historique rétroactif : l'historique ne
 * commence qu'à partir du premier appel réussi de ce cron.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const [assets, watchlist] = await Promise.all([
    prisma.asset.findMany({ select: { ticker: true } }),
    prisma.watchlistItem.findMany({ select: { ticker: true } }),
  ]);
  const tickers = [...new Set([...assets.map((a) => a.ticker), ...watchlist.map((w) => w.ticker)])];

  if (tickers.length === 0) {
    return NextResponse.json({ ok: true, count: 0, total: 0 });
  }

  const quotes = await getYahooQuotes(tickers);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let count = 0;
  for (const ticker of tickers) {
    const quote = quotes[ticker];
    if (!quote) continue;
    await prisma.priceHistory.upsert({
      where: { ticker_date: { ticker, date: today } },
      update: { close: quote.price },
      create: { ticker, date: today, close: quote.price },
    });
    count++;
  }

  return NextResponse.json({ ok: true, count, total: tickers.length });
}
