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
 * portent déjà des valeurs réelles confirmées par Trade Republic, et (b)
 * l'import est idempotent via `transaction_id` (stocké dans
 * `Transaction.externalRef`, et dans le `note` des dépôts/frais) —
 * réimporter le même fichier ne duplique rien.
 *
 * Calibré sur un vrai export (en-tête `datetime,date,account_type,category,
 * type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,
 * original_amount,original_currency,fx_rate,description`). Classification
 * des valeurs de `type` observées :
 * - BUY / SELL : ordre réel sur position (le seul cas où la quantité
 *   compte) — la quantité Trade Republic est signée (négative en vente),
 *   on n'en garde que la magnitude.
 * - CUSTOMER_INPAYMENT, CUSTOMER_INBOUND, TRANSFER_INBOUND,
 *   TRANSFER_INSTANT_INBOUND : versement de cash → `Deposit`.
 * - CARD_ORDERING_FEE : frais pur (pas de mouvement de cash côté `amount`,
 *   juste un `fee`) → `Fee` (type AUTRE).
 * - INTEREST_PAYMENT, CARD_TRANSACTION, IPO_SUBSCRIPTION : ignorés pour le
 *   portefeuille. IPO_SUBSCRIPTION représente une réservation de cash
 *   provisoire (puis son remboursement partiel) en amont d'un ordre IPO —
 *   l'achat réel apparaît séparément comme une ligne BUY normale, donc
 *   compter aussi la réservation ferait doublonner le cash sorti.
 * - Toute autre valeur : signalée en warning (`type non reconnu`) plutôt
 *   que silencieusement ignorée, pour rester visible si Trade Republic
 *   introduit un nouveau type.
 *
 * Le compte "Trade Republic" est trouvé ou créé automatiquement (un seul
 * compte CTO par utilisateur pour ce courtier).
 */

const DEPOSIT_TYPES = new Set(["CUSTOMER_INPAYMENT", "CUSTOMER_INBOUND", "TRANSFER_INBOUND", "TRANSFER_INSTANT_INBOUND"]);
const FEE_ONLY_TYPES = new Set(["CARD_ORDERING_FEE"]);
const SKIPPED_TYPES = new Set(["INTEREST_PAYMENT", "CARD_TRANSACTION", "IPO_SUBSCRIPTION"]);
const TRADE_TYPES = new Set(["BUY", "SELL"]);

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
    return NextResponse.json({ transactionsCreated: 0, depositsCreated: 0, feesCreated: 0, skipped: 0, warnings, errors: [] });
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

  const existingFees = await prisma.fee.findMany({ where: { accountId }, select: { note: true } });
  const seenFeeRefs = new Set(existingFees.map((f) => f.note).filter((n): n is string => !!n));

  let transactionsCreated = 0;
  let depositsCreated = 0;
  let feesCreated = 0;
  let skipped = 0;
  const skippedByType = new Map<string, number>();
  const unrecognizedTypes = new Map<string, number>();
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

  async function createFee(row: ParsedTrCsvRow, amount: number) {
    const feeRef = `Importé Trade Republic — id:${row.transactionId}`;
    if (seenFeeRefs.has(feeRef)) return;
    await prisma.fee.create({ data: { accountId, type: "AUTRE", amount, date: row.date, note: feeRef } });
    seenFeeRefs.add(feeRef);
    feesCreated++;
  }

  for (const row of rows) {
    if (SKIPPED_TYPES.has(row.type)) {
      skippedByType.set(row.type, (skippedByType.get(row.type) ?? 0) + 1);
      continue;
    }

    if (FEE_ONLY_TYPES.has(row.type)) {
      const amount = row.fee || Math.abs(row.amount);
      if (amount > 0) {
        try {
          await createFee(row, amount);
        } catch (err) {
          errors.push(`Frais ${row.transactionId} : ${err instanceof Error ? err.message : "erreur lors de la création"}`);
        }
      }
      continue;
    }

    if (DEPOSIT_TYPES.has(row.type)) {
      const depositRef = `Importé Trade Republic — id:${row.transactionId}`;
      if (seenDepositRefs.has(depositRef)) {
        skipped++;
        continue;
      }
      try {
        await prisma.deposit.create({ data: { accountId, amount: row.amount, date: row.date, note: depositRef } });
        seenDepositRefs.add(depositRef);
        depositsCreated++;
        if (row.fee > 0) await createFee(row, row.fee);
      } catch (err) {
        errors.push(`Dépôt ${row.transactionId} : ${err instanceof Error ? err.message : "erreur lors de la création"}`);
      }
      continue;
    }

    if (!TRADE_TYPES.has(row.type)) {
      unrecognizedTypes.set(row.type, (unrecognizedTypes.get(row.type) ?? 0) + 1);
      continue;
    }

    if (seenRefs.has(row.transactionId)) {
      skipped++;
      continue;
    }

    const txType: "BUY" | "SELL" = row.type === "SELL" ? "SELL" : "BUY";
    // Trade Republic signe la quantité (négative côté vente) — seule la
    // magnitude nous intéresse, le sens vient de `txType`.
    const quantity = row.quantity !== null ? Math.abs(row.quantity) : row.price ? Math.abs(row.amount) / row.price : null;
    if (!quantity || quantity <= 0) {
      errors.push(`${row.assetName} (${row.transactionId}) : quantité indéterminable, ligne ignorée`);
      continue;
    }
    const unitPrice = row.price ? Math.abs(row.price) : Math.abs(row.amount) / quantity;

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
            note: "Projection DCA confirmée depuis l'export Trade Republic",
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
            note: "Import Trade Republic",
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
  for (const [type, count] of skippedByType) {
    allWarnings.push(`${count} ligne(s) ${type} ignorée(s) (hors portefeuille).`);
  }
  for (const [type, count] of unrecognizedTypes) {
    allWarnings.push(`${count} ligne(s) de type "${type}" non reconnu — ignorée(s), signale-le pour l'ajouter.`);
  }
  if (skipped > 0) allWarnings.push(`${skipped} ligne(s) déjà importée(s) (transaction_id déjà connu) ignorée(s).`);

  return NextResponse.json({ transactionsCreated, depositsCreated, feesCreated, skipped, warnings: allWarnings, errors });
}
