import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getQuotes } from "@/lib/finnhub";
import {
  currentQuantity,
  totalAcquisitionCost,
  unrealizedPnl,
  realizedPnl,
} from "@/lib/finance-calculations";

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId");

  const positions = await prisma.position.findMany({
    where: accountId ? { accountId } : undefined,
    include: { asset: true, transactions: true },
  });

  if (positions.length === 0) {
    return NextResponse.json({
      totalValue: 0,
      totalAcquisitionCost: 0,
      unrealizedPnl: 0,
      unrealizedPnlPct: 0,
      realizedPnl: 0,
    });
  }

  const tickers = [...new Set(positions.map((p) => p.asset.ticker))];
  const quotes = await getQuotes(tickers);

  let totalValue = 0;
  let totalCost = 0;
  let totalUnrealized = 0;
  let totalRealized = 0;

  for (const position of positions) {
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
    const cost = totalAcquisitionCost(txs);
    const unrealized = unrealizedPnl(txs, currentPrice);
    const realized = realizedPnl(txs);

    totalValue += qty * currentPrice;
    totalCost += cost;
    totalUnrealized += unrealized;
    totalRealized += realized;
  }

  const unrealizedPct = totalCost > 0 ? totalUnrealized / totalCost : 0;

  return NextResponse.json({
    totalValue,
    totalAcquisitionCost: totalCost,
    unrealizedPnl: totalUnrealized,
    unrealizedPnlPct: unrealizedPct,
    realizedPnl: totalRealized,
  });
}
