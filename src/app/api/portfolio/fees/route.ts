import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { annualFeeRatio } from "@/lib/finance-calculations";
import { getQuotes } from "@/lib/finnhub";
import { currentQuantity } from "@/lib/finance-calculations";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const accountId = req.nextUrl.searchParams.get("accountId");

  const fees = await prisma.fee.findMany({
    where: {
      account: { userId: session.user.id },
      ...(accountId ? { accountId } : {}),
    },
  });

  const totalFeesAllTime = fees.reduce((sum, f) => sum + f.amount.toNumber(), 0);

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const totalFeesLast12m = fees
    .filter((f) => f.date >= oneYearAgo)
    .reduce((sum, f) => sum + f.amount.toNumber(), 0);

  const byTypeMap = new Map<string, number>();
  for (const f of fees) {
    byTypeMap.set(f.type, (byTypeMap.get(f.type) ?? 0) + f.amount.toNumber());
  }
  const byType = Array.from(byTypeMap.entries()).map(([type, amount]) => ({ type, amount }));

  // Valeur moyenne du portefeuille sur 12 mois (approximation simple :
  // valeur actuelle, faute d'historique de valorisation au jour le jour)
  const positions = await prisma.position.findMany({
    where: {
      account: { userId: session.user.id },
      ...(accountId ? { accountId } : {}),
    },
    include: { asset: true, transactions: true },
  });

  let avgPortfolioValue = 0;
  if (positions.length > 0) {
    const tickers = [...new Set(positions.map((p) => p.asset.ticker))];
    const quotes = await getQuotes(tickers);

    for (const position of positions) {
      const txs = position.transactions.map((t) => ({
        type: t.type,
        quantity: t.quantity,
        price: t.price,
        fees: t.fees,
        date: t.date,
      }));
      const qty = currentQuantity(txs);
      const price = quotes[position.asset.ticker]?.c ?? 0;
      avgPortfolioValue += qty * price;
    }
  }

  return NextResponse.json({
    totalFeesAllTime,
    totalFeesLast12m,
    annualFeeRatio: annualFeeRatio(totalFeesLast12m, avgPortfolioValue),
    byType,
  });
}
