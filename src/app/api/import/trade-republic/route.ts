import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseTradeRepublicCsv, type ParsedTrCsvRow } from "@/lib/parsers/trade-republic-csv";
import { resolveAssetByIsin, resolveAssetName } from "@/lib/parsers/asset-mapping";
import { findReconcilableProjected } from "@/lib/dca-reconcile";

/**
 * Import du CSV "Transactions" Trade Republic — flux différent de
 * /api/import/boursorama : pas d'étape d'aperçu/confirmation séparée, écrit
 * directement en base. Acceptable ici parce que (a) les lignes du CSV
 * portent déjà des valeurs réelles confirmées par Trade Republic (pas une
 * extraction PDF approximative à vérifier), et (b) l'import est idempotent
 * via `transaction_id` (stocké dans `Transaction.externalRef`, et dans le
 * `note` des dépôts) — réimporter le même fichier ne duplique rien, donc
 * aucune perte possible à corriger après coup.
 *
 * Le compte "Trade Republic" est trouvé ou créé automatiquement (un seul
 * compte CTO par utilisateur pour ce courtier ; pas de support multi-compte
 * Trade Republic pour l'instant).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier CSV requis (champ 'file')" }, { status: 400 });
  }

  const text = await file.text();
  const { rows, warnings } = parseTradeRepublicCsv(text);

  if (rows.length === 0) {
    return NextResponse.json({ transactionsCreated: 0, depositsCreated: 0, skipped: 0, warnings, errors: [] });
  }

  let account = await prisma.account.findFirst({ where: { userId: session.user.id, broker: "TRADE_REPUBLIC" } });
  if (!account) {
    account = await prisma.account.create({
      data: { userId: session.user.id, name: "Trade Republic", type: "CTO", broker: "TRADE_REPUBLIC" },
    });
  }
  const accountId = account.id;

  const existingTx = await prisma.transaction.findMany({
    where: { position: { accountId }, externalRef: { not: null } },
    select: { externalRef: true },
  });
  const seenRefs = new Set(existingTx.map((t) => t.externalRef!));

  const existingDeposits = await prisma.deposit.findMany({ where: { accountId }, select: { note: true } });
  const seenDepositRefs = new Set(existingDeposits.map((d) => d.note).filter((n): n is string => !!n));

  let transactionsCreated = 0;
  let depositsCreated = 0;
  let skipped = 0;
  let interestSkipped = 0;
  let cardSkipped = 0;
  const errors: string[] = [];

  async function resolveAsset(row: ParsedTrCsvRow) {
    const byIsin = row.isin ? resolveAssetByIsin(row.isin) : null;
    const byName = !byIsin?.matched ? resolveAssetName(row.assetName) : null;
    const known = byIsin?.matched ? byIsin.asset : byName?.matched ? byName.asset : null;

    if (known?.ticker) {
      return prisma.asset.upsert({
        where: { ticker: known.ticker },
        update: {},
        create: {
          ticker: known.ticker,
          isin: known.isin,
          name: known.name,
          sector: known.sector,
          region: known.region,
          currency: known.currency,
          assetType: known.assetType,
          benchmarkTicker: known.benchmarkTicker,
        },
      });
    }

    // Actif non reconnu : on utilise l'ISIN (ou un identifiant dérivé du nom)
    // comme ticker de repli — le cours ne sera pas automatiquement coté, mais
    // rien n'est jamais bloqué ni fabriqué (cf. resolvePrice, replie sur le PRU).
    const fallbackTicker = row.isin ?? row.assetName.toUpperCase().replace(/[^A-Z0-9]/g, "_").slice(0, 30);
    return prisma.asset.upsert({
      where: { ticker: fallbackTicker },
      update: {},
      create: { ticker: fallbackTicker, isin: row.isin, name: row.assetName, assetType: "ACTION", currency: "EUR" },
    });
  }

  for (const row of rows) {
    if (row.type === "INTEREST") {
      interestSkipped++;
      continue;
    }
    if (row.type === "CARD_TRANSACTION") {
      cardSkipped++;
      continue;
    }

    if (row.type === "DEPOSIT") {
      const depositRef = `Importé Trade Republic — id:${row.transactionId}`;
      if (seenDepositRefs.has(depositRef)) {
        skipped++;
        continue;
      }
      try {
        await prisma.deposit.create({ data: { accountId, amount: row.amount, date: row.date, note: depositRef } });
        seenDepositRefs.add(depositRef);
        depositsCreated++;
      } catch (err) {
        errors.push(`Dépôt ${row.transactionId} : ${err instanceof Error ? err.message : "erreur lors de la création"}`);
      }
      continue;
    }

    // BUY / SELL / IPO — IPO est traité comme un achat ou une vente selon le
    // signe du montant (un IPO se solde par un débit à l'achat, un crédit au
    // remboursement/à la revente).
    if (seenRefs.has(row.transactionId)) {
      skipped++;
      continue;
    }

    const txType: "BUY" | "SELL" = row.type === "SELL" || (row.type === "IPO" && row.amount > 0) ? "SELL" : "BUY";
    const quantity = row.quantity ?? (row.price ? Math.abs(row.amount) / row.price : null);
    if (!quantity || quantity <= 0) {
      errors.push(`${row.assetName} (${row.transactionId}) : quantité indéterminable, ligne ignorée`);
      continue;
    }
    const unitPrice = row.price ?? Math.abs(row.amount) / quantity;

    try {
      const asset = await resolveAsset(row);
      const position = await prisma.position.upsert({
        where: { accountId_assetId: { accountId, assetId: asset.id } },
        update: {},
        create: { accountId, assetId: asset.id },
      });

      const projected = txType === "BUY" ? await findReconcilableProjected(position.id, row.date) : null;

      if (projected) {
        await prisma.transaction.update({
          where: { id: projected.id },
          data: {
            status: "CONFIRMED",
            quantity,
            price: unitPrice,
            fees: row.fee,
            date: row.date,
            externalRef: row.transactionId,
            isSavingsPlan: row.isSavingsPlan,
            note: `Projection DCA confirmée depuis l'export Trade Republic`,
          },
        });
      } else {
        await prisma.transaction.create({
          data: {
            positionId: position.id,
            type: txType,
            status: "CONFIRMED",
            quantity,
            price: unitPrice,
            fees: row.fee,
            date: row.date,
            externalRef: row.transactionId,
            isSavingsPlan: row.isSavingsPlan,
            note: row.type === "IPO" ? `Import Trade Republic — IPO (${row.assetName})` : "Import Trade Republic",
          },
        });
      }

      seenRefs.add(row.transactionId);
      transactionsCreated++;
    } catch (err) {
      errors.push(`${row.assetName} (${row.transactionId}) : ${err instanceof Error ? err.message : "erreur lors de la création"}`);
    }
  }

  const allWarnings = [...warnings];
  if (interestSkipped > 0) allWarnings.push(`${interestSkipped} ligne(s) INTEREST ignorée(s) (hors portefeuille).`);
  if (cardSkipped > 0) allWarnings.push(`${cardSkipped} ligne(s) CARD_TRANSACTION ignorée(s) (hors portefeuille).`);
  if (skipped > 0) allWarnings.push(`${skipped} ligne(s) déjà importée(s) (transaction_id déjà connu) ignorée(s).`);

  return NextResponse.json({ transactionsCreated, depositsCreated, skipped, warnings: allWarnings, errors });
}
