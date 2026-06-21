import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { resolveAssetName } from "@/lib/parsers/asset-mapping";

type ConfirmTransaction = {
  filename: string;
  date: string;
  operationLabel: string;
  assetName: string;
  ticker: string;
  quantity: number;
  amount: number;
  type: "BUY" | "SELL";
};

type ConfirmDeposit = {
  filename: string;
  date: string;
  label: string;
  amount: number;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json();
  const { accountId, transactions, deposits } = body as {
    accountId?: string;
    transactions?: ConfirmTransaction[];
    deposits?: ConfirmDeposit[];
  };

  if (!accountId) {
    return NextResponse.json({ error: "accountId requis" }, { status: 400 });
  }

  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: session.user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  }

  let transactionsCreated = 0;
  let depositsCreated = 0;
  const errors: string[] = [];

  for (const tx of transactions ?? []) {
    const ticker = tx.ticker?.trim().toUpperCase();
    if (!ticker) {
      errors.push(`${tx.assetName} : ticker manquant, ligne ignorée`);
      continue;
    }

    try {
      const resolution = resolveAssetName(tx.assetName);
      // On fait confiance aux métadonnées résolues (nom, ISIN, secteur...) si
      // le nom est reconnu ET que le ticker final correspond au ticker
      // connu — ou qu'aucun ticker canonique n'était défini (fonds identifié
      // par son ISIN, ticker résolu dynamiquement via Finnhub à l'import).
      const known =
        resolution.matched && (!resolution.asset.ticker || resolution.asset.ticker === ticker) ? resolution.asset : null;

      const asset = await prisma.asset.upsert({
        where: { ticker },
        update: {},
        create: known
          ? {
              ticker,
              isin: known.isin,
              name: known.name,
              sector: known.sector,
              region: known.region,
              currency: known.currency,
              assetType: known.assetType,
              benchmarkTicker: known.benchmarkTicker,
            }
          : { ticker, name: tx.assetName, assetType: "ACTION", currency: "EUR" },
      });

      const position = await prisma.position.upsert({
        where: { accountId_assetId: { accountId, assetId: asset.id } },
        update: {},
        create: { accountId, assetId: asset.id },
      });

      const unitPrice = tx.amount / tx.quantity;

      await prisma.transaction.create({
        data: {
          positionId: position.id,
          type: tx.type,
          status: "CONFIRMED",
          quantity: tx.quantity,
          price: unitPrice,
          fees: 0,
          date: new Date(tx.date),
          sourceDocument: tx.filename,
          note: `Importé depuis PDF — ${tx.operationLabel}`,
        },
      });

      transactionsCreated++;
    } catch (err) {
      errors.push(`${tx.assetName} : ${err instanceof Error ? err.message : "erreur lors de la création"}`);
    }
  }

  for (const dep of deposits ?? []) {
    try {
      await prisma.deposit.create({
        data: {
          accountId,
          amount: dep.amount,
          date: new Date(dep.date),
          note: `Importé depuis PDF — ${dep.label}`,
        },
      });
      depositsCreated++;
    } catch (err) {
      errors.push(`Dépôt ${dep.label} : ${err instanceof Error ? err.message : "erreur lors de la création"}`);
    }
  }

  return NextResponse.json({ transactionsCreated, depositsCreated, errors });
}
