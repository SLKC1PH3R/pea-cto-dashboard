/**
 * Parser pour l'export CSV "Transactions" de Trade Republic.
 *
 * Calibré sur un vrai export (en-tête réel) :
 *   datetime, date, account_type, category, type, asset_class, name,
 *   symbol, shares, price, amount, fee, tax, currency, original_amount,
 *   original_currency, fx_rate, description
 *
 * Toutes les lignes sont retournées avec leur `type` brut (pas de filtre ici)
 * — c'est `/api/import/trade-republic/route.ts` qui décide quoi faire de
 * chaque type (achat/vente, dépôt, frais, ou ignoré) : la liste des valeurs
 * de `type` rencontrées dans un relevé réel est longue (CUSTOMER_INPAYMENT,
 * CARD_ORDERING_FEE, CUSTOMER_INBOUND, INTEREST_PAYMENT, TRANSFER_INBOUND,
 * TRANSFER_INSTANT_INBOUND, IPO_SUBSCRIPTION, BUY, SELL, CARD_TRANSACTION...)
 * et continuera de s'enrichir — préférable de centraliser la classification
 * côté route plutôt que de la dupliquer ici.
 */

export type ParsedTrCsvRow = {
  transactionId: string;
  date: Date;
  type: string; // valeur brute de la colonne `type`, en majuscules
  isin: string | null; // colonne `symbol` — ISIN réel ou pseudo-ISIN crypto (ex: XF000BTC0017)
  assetName: string; // colonne `name`
  quantity: number | null; // colonne `shares`, signée (négative en cas de vente) — à passer en abs() côté appelant
  price: number | null;
  amount: number; // colonne `amount`, signée ; si absente mais shares+price connus, dérivée de shares*price
  fee: number; // toujours positive (magnitude)
  isSavingsPlan: boolean; // détecté sur `description` ("Savings plan execution ...")
  note: string; // colonne `description`
};

export type TradeRepublicCsvParseResult = {
  rows: ParsedTrCsvRow[];
  warnings: string[];
};

// Ordonnés du plus fiable au moins fiable — le premier candidat trouvé dans
// l'en-tête gagne, même s'il n'est pas en première position dans le fichier.
// Crucial pour `date` : la colonne `datetime` (ISO, sans ambiguïté) doit
// primer sur `date` (JJ/MM/AAAA — `new Date()` la lirait en MM/JJ/AAAA et
// produirait des dates fausses ou invalides selon le jour).
const HEADER_CANDIDATES: Record<string, string[]> = {
  transactionId: ["transaction_id", "transactionid", "id", "reference", "ref"],
  date: ["datetime", "timestamp", "date", "datum", "execution_date", "booking_date"],
  type: ["type", "typ"],
  isin: ["symbol", "isin", "instrument_isin", "instrument_id", "asset_id"],
  assetName: ["name", "title", "asset_name", "beschreibung", "instrument_name"],
  quantity: ["shares", "quantity", "anzahl", "nb_shares", "amount_shares"],
  price: ["price", "price_per_share", "preis", "execution_price", "share_price"],
  amount: ["amount", "total", "betrag", "gesamtbetrag", "net_amount"],
  fee: ["fee", "fees", "gebuehr", "commission"],
  note: ["description", "note", "comment"],
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_]/g, "_");
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

function findHeaderIndex(headerFields: string[], candidates: string[]): number | undefined {
  for (const cand of candidates) {
    const idx = headerFields.indexOf(cand);
    if (idx >= 0) return idx;
  }
  return undefined;
}

export function parseTradeRepublicCsv(text: string): TradeRepublicCsvParseResult {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], warnings: ["Fichier vide ou sans ligne de données."] };
  }

  // Détecte le séparateur — observé en tabulation, virgule, et point-virgule
  // selon la version/locale de l'export ; on prend celui qui découpe le plus
  // de colonnes sur la ligne d'en-tête.
  const delimiter = ([",", ";", "\t"] as const).reduce((best, d) => (lines[0].split(d).length > lines[0].split(best).length ? d : best), ",");
  const headerFields = lines[0].split(delimiter).map(normalizeHeader);
  const colIndex: Record<string, number> = {};
  for (const [field, candidates] of Object.entries(HEADER_CANDIDATES)) {
    const idx = findHeaderIndex(headerFields, candidates);
    if (idx !== undefined) colIndex[field] = idx;
  }

  if (colIndex.date === undefined || colIndex.type === undefined) {
    warnings.push(
      `Colonnes essentielles non reconnues (date/type) dans l'en-tête : "${lines[0]}". Partage cette ligne d'en-tête pour ajuster le parser.`
    );
    return { rows: [], warnings };
  }

  const rows: ParsedTrCsvRow[] = [];
  let unparsedDates = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(delimiter).map((f) => f.trim());
    const get = (key: string) => (colIndex[key] !== undefined ? fields[colIndex[key]] : undefined);

    const dateStr = get("date");
    const typeStr = get("type")?.toUpperCase();
    if (!dateStr || !typeStr) continue;

    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      unparsedDates++;
      continue;
    }

    const shares = parseNumber(get("quantity"));
    const price = parseNumber(get("price"));
    let amount = parseNumber(get("amount"));
    // Certaines lignes d'ordre manuel (ex: achat suite à souscription IPO)
    // n'ont pas de colonne `amount` renseignée alors que shares+price le
    // sont — on la dérive plutôt que de perdre la ligne.
    if (amount === null && shares !== null && price !== null) {
      amount = shares * price;
    }
    if (amount === null) amount = 0;

    const noteRaw = get("note") ?? "";
    const isSavingsPlan = /savings plan|sparplan|plan d.investissement/i.test(noteRaw);

    rows.push({
      transactionId: get("transactionId") || `${dateStr}-${i}`,
      date,
      type: typeStr,
      isin: get("isin")?.toUpperCase() || null,
      assetName: get("assetName") || typeStr,
      quantity: shares,
      price,
      amount,
      fee: Math.abs(parseNumber(get("fee")) ?? 0),
      isSavingsPlan,
      note: noteRaw,
    });
  }

  if (rows.length === 0) {
    warnings.push("Aucune ligne exploitable détectée — vérifie le format des colonnes date/type.");
  }
  if (unparsedDates > 0) {
    warnings.push(`${unparsedDates} ligne(s) avec une date illisible ignorée(s).`);
  }

  return { rows, warnings };
}
