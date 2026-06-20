/**
 * Parser pour les relevés de compte Boursorama (PDF).
 *
 * Calibré sur trois variantes de document observées :
 *
 * 1. "Extrait de votre compte en EUR" (CTO) :
 *    08/05/2026 ACHAT ETRANGER 11/05/2026 479,44
 *    Nom de la valeur: ISHS COR MSCI WLD
 *    Quantité: 4
 *
 * 2. "RELEVE COMPTE ESPECES" (PEA) :
 *    04/04/2025 ACHAT ETRANGER 101 ISHS VI-ISMWSPE EO 496,08
 *    (ici la quantité est sur la même ligne, avant le nom de la valeur)
 *
 * 3. "Avis d'opéré" (confirmation d'ordre, une transaction par PDF) :
 *    ACHAT COMPTANT [ETR]
 *    ACTION
 *    Date et heure
 *    locale d'exécution Quantité Informations sur la valeur Informations sur l'exécution
 *    07/05/2026
 *    12:48:59
 *    5 AM.NASDQ-100 SW.UC.ETF-EUR C0D Référence : 010163440408
 *    ...
 *    Montant brut Commission Frais (¨) Montant net au débit de votre compte
 *    1 392,75 EUR 8,36 EUR 1 401,11 EUR
 *    (variante étrangère "ETR" : le libellé "Montant net au débit de votre
 *    compte" et son montant sont chacun sur leur propre ligne)
 *
 * Les variantes partagent les mêmes libellés d'opération (ACHAT ETRANGER,
 * ACHAT COMPTANT, VENTE ETRANGER, VENTE COMPTANT, VIR ...) mais une mise en
 * page différente. On essaie chaque stratégie d'extraction et on garde
 * celle qui produit des résultats.
 */

export type ParsedBoursoramaTransaction = {
  date: Date;
  operationLabel: string; // ex: "ACHAT ETRANGER"
  assetName: string; // ex: "ISHS COR MSCI WLD" — nom Boursorama, pas le ticker
  quantity: number;
  amount: number; // montant débité/crédité en EUR
  type: "BUY" | "SELL";
  sourceText: string; // bloc brut, utile pour debug/audit
};

export type ParsedBoursoramaDeposit = {
  date: Date;
  label: string;
  amount: number; // positif = dépôt, négatif = retrait
};

export type BoursoramaParseResult = {
  transactions: ParsedBoursoramaTransaction[];
  deposits: ParsedBoursoramaDeposit[];
  accountIban: string | null;
  warnings: string[];
};

const BUY_LABELS = ["ACHAT ETRANGER", "ACHAT COMPTANT"];
const SELL_LABELS = ["VENTE ETRANGER", "VENTE COMPTANT"];
const DEPOSIT_LABELS = ["VIR"]; // virements (entrants en général dans ce contexte)

const DATE_RE = /(\d{2})\/(\d{2})\/(\d{4})/;
const TIME_RE = /^(\d{2}):(\d{2}):(\d{2})$/;

function parseFrDate(s: string, timeStr?: string | null): Date {
  const m = s.match(DATE_RE);
  if (!m) throw new Error(`Date illisible: "${s}"`);
  const [, dd, mm, yyyy] = m;
  const tm = timeStr?.match(TIME_RE);
  const [hh, min, sec] = tm ? [Number(tm[1]), Number(tm[2]), Number(tm[3])] : [0, 0, 0];
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), hh, min, sec);
}

function parseFrAmount(s: string): number {
  // "1.401,11" -> 1401.11 ; "479,44" -> 479.44
  const cleaned = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) throw new Error(`Montant illisible: "${s}"`);
  return n;
}

function classify(label: string): "BUY" | "SELL" | "DEPOSIT" | "UNKNOWN" {
  const upper = label.toUpperCase();
  if (BUY_LABELS.some((l) => upper.includes(l))) return "BUY";
  if (SELL_LABELS.some((l) => upper.includes(l))) return "SELL";
  if (DEPOSIT_LABELS.some((l) => upper.startsWith(l))) return "DEPOSIT";
  return "UNKNOWN";
}

/**
 * Variante 1 : "ACHAT ETRANGER" sur une ligne, "Nom de la valeur: X" et
 * "Quantité: N" sur les lignes suivantes (relevé "Extrait de compte").
 *
 * Exemple :
 *   08/05/2026 ACHAT ETRANGER 11/05/2026 479,44
 *   Nom de la valeur: ISHS COR MSCI WLD
 *   Quantité: 4
 */
function parseMultilineFormat(text: string): ParsedBoursoramaTransaction[] {
  const results: ParsedBoursoramaTransaction[] = [];

  // On découpe en blocs commençant par une date au format JJ/MM/AAAA suivie
  // d'un libellé connu, jusqu'au prochain bloc de ce type.
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateMatch = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(ACHAT ETRANGER|ACHAT COMPTANT|VENTE ETRANGER|VENTE COMPTANT)/i);
    if (!dateMatch) continue;

    const [, dateStr, label] = dateMatch;
    const txType = classify(label);
    if (txType !== "BUY" && txType !== "SELL") continue;

    // Montant : dernier nombre décimal de la ligne, mais on exclut les dates
    // (JJ/MM/AAAA) qui précèdent souvent le montant sur cette même ligne
    // (ex: "08/05/2026 ACHAT ETRANGER 11/05/2026 479,44" — la "date valeur"
    // 11/05/2026 ne doit pas être confondue avec le montant 479,44).
    const lineWithoutDates = line.replace(/\d{2}\/\d{2}\/\d{4}/g, "");
    const amountMatches = [...lineWithoutDates.matchAll(/(\d{1,3}(?:[.\s]\d{3})*,\d{2})/g)];
    const amountStr = amountMatches.at(-1)?.[1];

    // Cherche "Nom de la valeur:" et "Quantité:" dans les 1-2 lignes suivantes
    let assetName: string | null = null;
    let quantity: number | null = null;
    let sourceLines = [line];

    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const next = lines[j];
      sourceLines.push(next);

      const nameMatch = next.match(/Nom de la valeur\s*:\s*(.+)/i);
      if (nameMatch) assetName = nameMatch[1].trim();

      const qtyMatch = next.match(/Quantit[ée]\s*:\s*(\d+)/i);
      if (qtyMatch) quantity = Number(qtyMatch[1]);

      // Si on retombe sur une nouvelle ligne de transaction, on arrête
      if (j > i + 1 && /^\d{2}\/\d{2}\/\d{4}/.test(next)) break;
    }

    if (assetName && quantity && amountStr) {
      results.push({
        date: parseFrDate(dateStr),
        operationLabel: label.toUpperCase(),
        assetName,
        quantity,
        amount: parseFrAmount(amountStr),
        type: txType,
        sourceText: sourceLines.join(" | "),
      });
    }
  }

  return results;
}

/**
 * Variante 2 : tout sur une seule ligne (relevé "Compte espèces") :
 *   04/04/2025 ACHAT ETRANGER 101 ISHS VI-ISMWSPE EO 496,08
 *   [date] [libellé opération] [quantité] [nom valeur...] [montant]
 */
function parseSingleLineFormat(text: string): ParsedBoursoramaTransaction[] {
  const results: ParsedBoursoramaTransaction[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const lineRe = /^(\d{2}\/\d{2}\/\d{4})\s+(ACHAT ETRANGER|ACHAT COMPTANT|VENTE ETRANGER|VENTE COMPTANT)\s+(\d+)\s+(.+?)\s+([\d.\s]*\d,\d{2})\s*$/i;

  for (const line of lines) {
    const m = line.match(lineRe);
    if (!m) continue;

    const [, dateStr, label, qtyStr, assetName, amountStr] = m;
    const txType = classify(label);
    if (txType !== "BUY" && txType !== "SELL") continue;

    results.push({
      date: parseFrDate(dateStr),
      operationLabel: label.toUpperCase(),
      assetName: assetName.trim(),
      quantity: Number(qtyStr),
      amount: parseFrAmount(amountStr),
      type: txType,
      sourceText: line,
    });
  }

  return results;
}

/**
 * Variante 3 : "avis d'opéré" — une confirmation d'ordre par PDF, mise en
 * page tabulaire (cf. en-tête du fichier pour le détail).
 */
function parseAvisOpereFormat(text: string): ParsedBoursoramaTransaction[] {
  const results: ParsedBoursoramaTransaction[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const opMatch = lines[i].match(/^(ACHAT|VENTE)\s+COMPTANT(?:\s+ETR)?$/i);
    if (!opMatch) continue;

    const label = lines[i];
    const txType = classify(label);
    if (txType !== "BUY" && txType !== "SELL") continue;

    // Cherche la date ET l'heure d'exécution (ligne "Date et heure locale
    // d'exécution" : la date est seule sur sa ligne, suivie de l'heure seule
    // sur la ligne suivante — ex. "07/05/2026" puis "12:48:59"), puis la
    // ligne "quantité + nom de la valeur + Référence :" qui suit.
    let dateStr: string | null = null;
    let timeStr: string | null = null;
    let quantity: number | null = null;
    let assetName: string | null = null;
    let qtyLineIdx = -1;

    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      const l = lines[j];

      if (!dateStr) {
        const dm = l.match(/^(\d{2}\/\d{2}\/\d{4})$/);
        if (dm) {
          dateStr = dm[1];
          continue;
        }
      } else if (!timeStr) {
        const tm = l.match(/^(\d{2}:\d{2}:\d{2})$/);
        if (tm) {
          timeStr = tm[1];
          continue;
        }
      }

      const qtyMatch = l.match(/^(\d+)\s+(.+?)\s+R[ée]f[ée]rence\s*:/i);
      if (qtyMatch) {
        quantity = Number(qtyMatch[1]);
        assetName = qtyMatch[2].trim();
        qtyLineIdx = j;
        break;
      }
    }

    if (!dateStr || quantity === null || !assetName) continue;

    // Cherche "Montant net au débit de votre compte" après la ligne
    // quantité, puis prend le dernier montant de la prochaine ligne qui en
    // contient un (gère les deux mises en page : valeurs alignées sur la
    // même ligne que l'en-tête, ou seules sur la ligne suivante).
    let amountStr: string | null = null;
    for (let j = qtyLineIdx; j < Math.min(qtyLineIdx + 15, lines.length); j++) {
      if (!/montant net au d[ée]bit de votre compte/i.test(lines[j])) continue;

      for (let k = j; k < Math.min(j + 3, lines.length); k++) {
        const amountMatches = [...lines[k].matchAll(/(\d{1,3}(?:[.\s]\d{3})*,\d{2})/g)];
        if (amountMatches.length > 0) {
          amountStr = amountMatches.at(-1)![1];
          break;
        }
      }
      break;
    }

    if (!amountStr) continue;

    results.push({
      date: parseFrDate(dateStr, timeStr),
      operationLabel: label.toUpperCase(),
      assetName,
      quantity,
      amount: parseFrAmount(amountStr),
      type: txType,
      sourceText: lines.slice(i, qtyLineIdx + 1).join(" | "),
    });
  }

  return results;
}

function parseDeposits(text: string): ParsedBoursoramaDeposit[] {
  const results: ParsedBoursoramaDeposit[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // "05/05/2026 VIR Virement depuis BoursoBank (joint) ... 1.900,00" — le
    // libellé peut être coupé sur 2 lignes par l'extraction PDF, donc on
    // regarde aussi la ligne suivante pour le montant si besoin.
    const dateMatch = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(VIR[^\d]*)/i);
    if (!dateMatch) continue;

    const [, dateStr, labelRaw] = dateMatch;

    // Cherche un montant sur cette ligne ou la suivante (jusqu'à 2 lignes après),
    // en excluant les dates qui pourraient être confondues avec un montant.
    let amountStr: string | null = null;
    for (let j = i; j < Math.min(i + 3, lines.length); j++) {
      const lineWithoutDates = lines[j].replace(/\d{2}\/\d{2}\/\d{4}/g, "");
      const amountMatches = [...lineWithoutDates.matchAll(/(\d{1,3}(?:[.\s]\d{3})*,\d{2})/g)];
      if (amountMatches.length > 0) {
        amountStr = amountMatches.at(-1)![1];
        break;
      }
    }

    if (amountStr) {
      results.push({
        date: parseFrDate(dateStr),
        label: labelRaw.trim(),
        amount: parseFrAmount(amountStr), // toujours positif ici : virement reçu
      });
    }
  }

  return results;
}

export function parseBoursoramaStatement(text: string): BoursoramaParseResult {
  const warnings: string[] = [];

  const ibanMatch = text.match(/I\.?B\.?A\.?N\.?\s*:?\s*([A-Z]{2}\d{2}[\dA-Z\s]{10,30})/i);
  const accountIban = ibanMatch ? ibanMatch[1].replace(/\s/g, "") : null;

  let transactions = parseMultilineFormat(text);
  if (transactions.length === 0) {
    transactions = parseSingleLineFormat(text);
  }
  if (transactions.length === 0) {
    transactions = parseAvisOpereFormat(text);
  }

  if (transactions.length === 0) {
    warnings.push(
      "Aucune transaction d'achat/vente détectée. Le format du relevé diffère peut-être de ceux calibrés (multi-ligne 'Nom de la valeur' / single-line / avis d'opéré)."
    );
  }

  const deposits = parseDeposits(text);

  return { transactions, deposits, accountIban, warnings };
}
