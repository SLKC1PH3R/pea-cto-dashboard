import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { resolveAssetName, resolveAssetByIsin } from "@/lib/parsers/asset-mapping";
import { txHeuristicKey, txReferenceKey, depositDuplicateKey } from "@/lib/parsers/duplicate-key";

type ConfirmTransaction = {
  filename: string;
  date: string;
  operationLabel: string;
  assetName: string;
  isin?: string | null;
  reference?: string | null;
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

  // Filet de sécurité : revérifie les doublons par contenu au moment de la
  // confirmation (même logique que l'aperçu), au cas où une ligne signalée
  // comme doublon aurait été cochée quand même.
  const existingTx = await prisma.transaction.findMany({
    where: { position: { accountId } },
    select: {
      date: true,
      quantity: true,
      price: true,
      type: true,
      externalRef: true,
      position: { select: { asset: { select: { ticker: true } } } },
    },
  });
  const seenHeuristicKeys = new Set(
    existingTx.map((t) => txHeuristicKey(t.position.asset.ticker, t.type, Number(t.quantity) * Number(t.price), t.date))
  );
  const seenRefKeys = new Set(existingTx.filter((t) => t.externalRef).map((t) => txReferenceKey(t.externalRef!)));
  const existingDeposits = await prisma.deposit.findMany({ where: { accountId }, select: { date: true, amount: true } });
  const seenDepKeys = new Set(existingDeposits.map((d) => depositDuplicateKey(Number(d.amount), d.date)));

  for (const tx of transactions ?? []) {
    const ticker = tx.ticker?.trim().toUpperCase();
    if (!ticker) {
      errors.push(`${tx.assetName} : ticker manquant, ligne ignorée`);
      continue;
    }

    // Une référence d'ordre présente fait foi (signal fiable) ; sinon repli
    // sur jour/actif/sens/montant — voir duplicate-key.ts pour le détail du
    // piège évité (gros ordre exécuté en plusieurs fois au même cours).
    const heuristicKey = txHeuristicKey(ticker, tx.type, tx.amount, new Date(tx.date));
    if (tx.reference) {
      const refKey = txReferenceKey(tx.reference);
      if (seenRefKeys.has(refKey)) {
        errors.push(`${tx.assetName} : doublon détecté (référence d'ordre déjà en base), ligne ignorée`);
        continue;
      }
      seenRefKeys.add(refKey);
      seenHeuristicKeys.add(heuristicKey);
    } else {
      if (seenHeuristicKeys.has(heuristicKey)) {
        errors.push(`${tx.assetName} : doublon détecté (même jour/sens/montant déjà en base), ligne ignorée`);
        continue;
      }
      seenHeuristicKeys.add(heuristicKey);
    }

    try {
      // L'ISIN imprimé sur le document (le plus fiable) prime sur le nom
      // abrégé Boursorama pour retrouver les métadonnées connues.
      const byIsin = tx.isin ? resolveAssetByIsin(tx.isin) : null;
      const resolution = byIsin ?? resolveAssetName(tx.assetName);
      // On fait confiance aux métadonnées résolues (nom, ISIN, secteur...) si
      // le nom/ISIN est reconnu ET que le ticker final correspond au ticker
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
          : { ticker, isin: tx.isin ?? undefined, name: tx.assetName, assetType: "ACTION", currency: "EUR" },
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
          externalRef: tx.reference ?? undefined,
          note: `Importé depuis PDF — ${tx.operationLabel}`,
        },
      });

      transactionsCreated++;
    } catch (err) {
      errors.push(`${tx.assetName} : ${err instanceof Error ? err.message : "erreur lors de la création"}`);
    }
  }

  for (const dep of deposits ?? []) {
    const depKey = depositDuplicateKey(dep.amount, new Date(dep.date));
    if (seenDepKeys.has(depKey)) {
      errors.push(`Dépôt ${dep.label} : doublon détecté (même jour/montant déjà en base), ligne ignorée`);
      continue;
    }
    seenDepKeys.add(depKey);

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
