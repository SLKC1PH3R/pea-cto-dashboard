import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  currentQuantity,
  totalAcquisitionCost,
  unrealizedPnl,
  realizedPnl,
} from "@/lib/finance-calculations";
import { getQuotes } from "@/lib/finnhub";

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
    include: { asset: true, transactions: true },
  });

  // Note : les transactions PROJECTED (issues d'un plan DCA sans confirmation
  // d'exécution réelle) sont incluses dans les calculs ci-dessous par défaut,
  // car elles représentent la meilleure estimation disponible. Elles restent
  // identifiables via `status` côté UI pour que l'utilisateur sache que la
  // précision est approximative jusqu'à ajustement manuel.

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
  let hasProjectedTransactions = false;

  for (const position of positions) {
    const txs = position.transactions.map((t) => ({
      type: t.type,
      quantity: t.quantity,
      price: t.price,
      fees: t.fees,
      date: t.date,
    }));

    if (position.transactions.some((t) => t.status === "PROJECTED")) {
      hasProjectedTransactions = true;
    }

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
    hasProjectedTransactions,
  });
}
