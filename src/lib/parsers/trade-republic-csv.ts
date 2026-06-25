/**
 * Parser pour l'export CSV "Transactions" de Trade Republic.
 *
 * ⚠️ Calibré sur la description du format fournie (pas sur un fichier réel
 * inspecté ligne à ligne dans cette conversation) : colonnes flexibles
 * détectées par nom (insensible à la casse/aux accents), valeurs de `type`
 * reprises telles que décrites : BUY, SELL, DEPOSIT, INTEREST,
 * CARD_TRANSACTION, IPO. Si le parsing échoue ou produit des lignes vides,
 * `warnings` le signale — partage la ligne d'en-tête (sans les montants) du
 * vrai export pour ajuster les noms de colonnes acceptés ci-dessous.
 *
 * Lignes ignorées pour le portefeuille (aucun impact sur les positions,
 * mais comptées dans les warnings pour rester visible) :
 * - INTEREST (intérêts versés sur les liquidités / fonds monétaires)
 * - CARD_TRANSACTION (dépenses carte, hors portefeuille)
 *
 * Lignes DEPOSIT alimentent les versements de compte (`Deposit`) ; BUY/SELL
 * et IPO (assimilé à un BUY/SELL selon le signe du montant) alimentent les
 * transactions sur position. `transaction_id` (UUID Trade Republic) sert de
 * clé d'idempotence — réimporter le même export ne doit rien dupliquer (la
 * vérification se fait côté route, contre `Transaction.externalRef`).
 */

export type TrCsvType = "BUY" | "SELL" | "DEPOSIT" | "INTEREST" | "CARD_TRANSACTION" | "IPO";

export type ParsedTrCsvRow = {
  transactionId: string;
  date: Date;
  type: TrCsvType;
  isin: string | null; // ISIN réel, ou identifiant interne TR pour les cryptos (ex: XF000BTC0017)
  assetName: string;
  quantity: number | null;
  price: number | null;
  amount: number; // montant net du mouvement, signé (négatif = sortie de cash)
  fee: number;
  isSavingsPlan: boolean;
  note: string;
};

export type TradeRepublicCsvParseResult = {
  rows: ParsedTrCsvRow[];
  warnings: string[];
};

const HEADER_CANDIDATES: Record<string, string[]> = {
  transactionId: ["transaction_id", "transactionid", "id", "reference", "ref"],
  date: ["date", "timestamp", "datum", "execution_date", "booking_date"],
  type: ["type", "typ"],
  isin: ["isin", "instrument_isin", "instrument_id", "asset_id"],
  assetName: ["title", "name", "asset_name", "description", "beschreibung", "instrument_name"],
  quantity: ["shares", "quantity", "anzahl", "nb_shares", "amount_shares"],
  price: ["price", "price_per_share", "preis", "execution_price", "share_price"],
  amount: ["amount", "total", "betrag", "gesamtbetrag", "net_amount"],
  fee: ["fee", "fees", "gebuehr", "commission"],
  savingsPlan: ["is_savings_plan", "savings_plan", "sparplan", "execution_type", "order_type"],
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_]/g, "_");
}

function splitCsvLine(line: string): string[] {
  // Gère les champs entre guillemets contenant des virgules (ex: noms d'actif).
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === "," || c === ";") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

function parseNumber(s: string | undefined): number | null {
  if (!s || s.trim() === "") return null;
  // Accepte aussi bien "1234.56" (export TR standard) que "1 234,56" (saisie locale).
  const cleaned = s.trim().replace(/\s/g, "");
  const usesComma = /,\d{1,6}$/.test(cleaned) && !/\.\d{1,6}$/.test(cleaned);
  const normalized = usesComma ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  const n = parseFloat(normalized);
  return Number.isNaN(n) ? null : n;
}

export function parseTradeRepublicCsv(text: string): TradeRepublicCsvParseResult {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], warnings: ["Fichier vide ou sans ligne de données."] };
  }

  const headerFields = splitCsvLine(lines[0]).map(normalizeHeader);
  const colIndex: Record<string, number> = {};
  for (const [field, candidates] of Object.entries(HEADER_CANDIDATES)) {
    const idx = headerFields.findIndex((h) => candidates.includes(h));
    if (idx >= 0) colIndex[field] = idx;
  }

  if (colIndex.date === undefined || colIndex.type === undefined || colIndex.amount === undefined) {
    warnings.push(
      `Colonnes essentielles non reconnues (date/type/montant) dans l'en-tête : "${lines[0]}". Partage cette ligne d'en-tête pour ajuster le parser.`
    );
    return { rows: [], warnings };
  }

  const rows: ParsedTrCsvRow[] = [];
  let skippedTypes = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    const get = (key: string) => (colIndex[key] !== undefined ? fields[colIndex[key]] : undefined);

    const dateStr = get("date");
    const typeStr = get("type")?.toUpperCase();
    const amount = parseNumber(get("amount"));

    if (!dateStr || !typeStr || amount === null) continue;

    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) continue;

    const validTypes: TrCsvType[] = ["BUY", "SELL", "DEPOSIT", "INTEREST", "CARD_TRANSACTION", "IPO"];
    if (!validTypes.includes(typeStr as TrCsvType)) {
      skippedTypes++;
      continue;
    }

    const savingsPlanRaw = get("savingsPlan")?.toLowerCase() ?? "";
    const noteRaw = get("assetName") ?? "";
    const isSavingsPlan =
      ["true", "1", "yes", "savings_plan"].includes(savingsPlanRaw) || /sparplan|savings plan|plan d.investissement/i.test(noteRaw);

    rows.push({
      transactionId: get("transactionId") ?? `${dateStr}-${i}`,
      date,
      type: typeStr as TrCsvType,
      isin: get("isin")?.toUpperCase() || null,
      assetName: noteRaw || typeStr,
      quantity: parseNumber(get("quantity")),
      price: parseNumber(get("price")),
      amount,
      fee: parseNumber(get("fee")) ?? 0,
      isSavingsPlan,
      note: noteRaw,
    });
  }

  if (rows.length === 0) {
    warnings.push("Aucune ligne exploitable détectée — vérifie le format des colonnes date/type/montant.");
  }
  if (skippedTypes > 0) {
    warnings.push(`${skippedTypes} ligne(s) avec un type non reconnu ignorée(s).`);
  }

  return { rows, warnings };
}
