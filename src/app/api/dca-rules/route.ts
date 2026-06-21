import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateDcaExecutionDates } from "@/lib/finance-calculations";
import { getQuote } from "@/lib/finnhub";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const rules = await prisma.dcaRule.findMany({
    where: { userId: session.user.id },
    include: { asset: true, account: true, transactions: { orderBy: { date: "desc" }, take: 1 }, _count: { select: { transactions: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    rules.map((r) => ({
      id: r.id,
      accountName: r.account.name,
      assetTicker: r.asset.ticker,
      assetName: r.asset.name,
      amount: r.amount.toNumber(),
      frequency: r.frequency,
      firstExecution: r.firstExecution.toISOString().slice(0, 10),
      active: r.active,
      note: r.note,
      executionsCount: r._count.transactions,
      lastExecutionDate: r.transactions[0]?.date.toISOString().slice(0, 10) ?? null,
    }))
  );
}

/**
 * Crée une règle DCA et génère immédiatement les transactions PROJECTED
 * correspondant aux exécutions passées (entre firstExecution et aujourd'hui).
 *
 * Comme on n'a pas le prix réel à chaque exécution (pas de confirmation
 * d'exécution Trade Republic), on utilise le cours Finnhub actuel comme
 * approximation pour toutes les projections. C'est une limite assumée :
 * la quantité affichée sera approximative jusqu'à ce que l'utilisateur
 * ajuste manuellement chaque exécution avec le prix réel (via l'édition
 * de transaction).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json();
  const { accountId, ticker, assetName, assetType, currency, amount, frequency, firstExecution, note } = body;

  if (!accountId || !ticker || !assetName || !amount || !frequency || !firstExecution) {
    return NextResponse.json(
      { error: "Champs requis: accountId, ticker, assetName, amount, frequency, firstExecution" },
      { status: 400 }
    );
  }

  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: session.user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  }

  const asset = await prisma.asset.upsert({
    where: { ticker },
    update: {},
    create: {
      ticker,
      name: assetName,
      assetType: assetType ?? "ETF_CAPITALISANT",
      currency: currency ?? account.currency,
    },
  });

  const position = await prisma.position.upsert({
    where: { accountId_assetId: { accountId, assetId: asset.id } },
    update: {},
    create: { accountId, assetId: asset.id },
  });

  const dcaRule = await prisma.dcaRule.create({
    data: {
      userId: session.user.id,
      accountId,
      assetId: asset.id,
      amount,
      frequency,
      firstExecution: new Date(firstExecution),
      note,
    },
  });

  // Génère les projections pour les exécutions passées
  const executionDates = generateDcaExecutionDates(
    new Date(firstExecution),
    frequency,
    new Date()
  );

  let approxPrice = 1;
  try {
    const quote = await getQuote(ticker);
    approxPrice = quote.c > 0 ? quote.c : 1;
  } catch {
    // Si Finnhub échoue (ticker inconnu, quota...), on garde un prix de 1
    // à titre de fallback — l'utilisateur devra ajuster manuellement.
  }

  const projectedTransactions = await prisma.$transaction(
    executionDates.map((date) =>
      prisma.transaction.create({
        data: {
          positionId: position.id,
          type: "BUY",
          status: "PROJECTED",
          quantity: Number(amount) / approxPrice,
          price: approxPrice,
          fees: 0,
          date,
          dcaRuleId: dcaRule.id,
          note: "Projection DCA — quantité approximative, à ajuster avec le prix réel",
        },
      })
    )
  );

  return NextResponse.json(
    { dcaRule, projectedCount: projectedTransactions.length },
    { status: 201 }
  );
}
