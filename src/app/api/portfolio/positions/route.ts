import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getQuotes } from "@/lib/finnhub";
import {
  currentQuantity,
  averageCostPrice,
  totalAcquisitionCost,
  unrealizedPnl,
  yieldOnCost,
  currentYield,
} from "@/lib/finance-calculations";
import { PositionMetrics } from "@/types/dashboard";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const accountId = req.nextUrl.searchParams.get("accountId");

  const positions = await prisma.position.findMany({
    where: {
      account: { userId: session.user.id },
      ...(accountId ? { accountId } : {}),
    },
    include: { asset: true, transactions: true, dividends: true },
  });

  if (positions.length === 0) {
    return NextResponse.json([]);
  }

  const tickers = [...new Set(positions.map((p) => p.asset.ticker))];
  const benchmarkTickers = [
    ...new Set(positions.map((p) => p.asset.benchmarkTicker).filter(Boolean) as string[]),
  ];
  const quotes = await getQuotes([...tickers, ...benchmarkTickers]);

  const result: PositionMetrics[] = positions.map((position) => {
    const txs = position.transactions.map((t) => ({
      type: t.type,
      quantity: t.quantity,
      price: t.price,
      fees: t.fees,
      date: t.date,
    }));

    const quote = quotes[position.asset.ticker];
    const currentPrice = quote?.c ?? 0;

    const qty = currentQuantity(txs);
    const pru = averageCostPrice(txs);
    const cost = totalAcquisitionCost(txs);
    const marketValue = qty * currentPrice;
    const pnl = unrealizedPnl(txs, currentPrice);
    const pnlPct = cost > 0 ? pnl / cost : 0;

    const isCapitalisant = position.asset.assetType === "ETF_CAPITALISANT";

    const divs = position.dividends.map((d) => ({
      netAmount: d.netAmount,
      date: d.date,
    }));

    const benchmarkQuote = position.asset.benchmarkTicker
      ? quotes[position.asset.benchmarkTicker]
      : null;

    return {
      positionId: position.id,
      ticker: position.asset.ticker,
      name: position.asset.name,
      assetType: position.asset.assetType,
      quantity: qty,
      averageCostPrice: pru,
      currentPrice,
      marketValue,
      acquisitionCost: cost,
      unrealizedPnl: pnl,
      unrealizedPnlPct: pnlPct,
      yieldOnCost: isCapitalisant ? null : yieldOnCost(divs, cost),
      currentYield: isCapitalisant ? null : currentYield(divs, marketValue),
      benchmarkTicker: position.asset.benchmarkTicker,
      // Comparaison simplifiée : variation du benchmark depuis son cours de clôture précédent.
      // Une version plus précise nécessitera l'historique de prix depuis la date d'achat (PriceHistory).
      benchmarkReturn: benchmarkQuote ? benchmarkQuote.dp / 100 : null,
    };
  });

  return NextResponse.json(result);
}
