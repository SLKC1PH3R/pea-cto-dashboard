/**
 * Résolution de symbole et cotation via les endpoints publics de
 * tradingview.com — pas une API officielle/documentée, mais bien plus
 * complète que Finnhub (plan gratuit, US uniquement) et boursorama.com
 * (n'indexe pas tous les fonds) pour les ETF européens. Utilisée en repli
 * pour la cotation, et comme moteur de résolution ticker/ISIN à l'import
 * (recherche par ISIN ou par nom). Fragile par nature — toute erreur réseau
 * ou changement d'API renvoie simplement `null`/[].
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (compatible; FolioDashboard/1.0)";
const HEADERS = { "User-Agent": USER_AGENT, Referer: "https://www.tradingview.com/", Origin: "https://www.tradingview.com" };

export type TradingViewSymbol = {
  symbol: string; // ex: "CW8"
  exchange: string; // ex: "Euronext Paris", "XETR"
  description: string;
  isin: string | null;
  currency: string | null;
};

export type TradingViewQuote = {
  price: number;
  dayPct: number;
  currency: string | null;
};

async function searchSymbols(query: string): Promise<TradingViewSymbol[]> {
  try {
    const url = `https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(query)}&hl=1&lang=fr&search_type=undefined`;
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const symbols = Array.isArray(data?.symbols) ? data.symbols : [];
    return symbols.map((s: Record<string, unknown>) => ({
      symbol: String(s.symbol ?? "").replace(/<\/?em>/g, ""),
      exchange: String(s.exchange ?? ""),
      description: String(s.description ?? "").replace(/<\/?em>/g, ""),
      isin: typeof s.isin === "string" ? s.isin.replace(/<\/?em>/g, "") : null,
      currency: typeof s.currency_code === "string" ? s.currency_code : null,
    }));
  } catch {
    return [];
  }
}

/** Cherche un symbole par ISIN — préfère Euronext Paris (broker français), sinon le premier résultat. */
export async function findTradingViewSymbolByIsin(isin: string): Promise<TradingViewSymbol | null> {
  const results = await searchSymbols(isin);
  if (results.length === 0) return null;
  return results.find((r) => r.exchange === "Euronext Paris") ?? results[0];
}

/** Cherche un symbole par nom libre (nom complet du fonds) — même priorité Euronext Paris. */
export async function findTradingViewSymbolByName(name: string): Promise<TradingViewSymbol | null> {
  const results = await searchSymbols(name);
  if (results.length === 0) return null;
  return results.find((r) => r.exchange === "Euronext Paris") ?? results[0];
}

const EXCHANGE_PREFIX: Record<string, string> = {
  "Euronext Paris": "EURONEXT",
  "Euronext Amsterdam": "EURONEXT",
  XETR: "XETR",
  GETTEX: "GETTEX",
};

function tickerFor(sym: TradingViewSymbol): string {
  const prefix = EXCHANGE_PREFIX[sym.exchange] ?? sym.exchange.toUpperCase();
  return `${prefix}:${sym.symbol}`;
}

export async function getTradingViewQuote(sym: TradingViewSymbol): Promise<TradingViewQuote | null> {
  try {
    const res = await fetch("https://scanner.tradingview.com/global/scan", {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ symbols: { tickers: [tickerFor(sym)], query: { types: [] } }, columns: ["close", "change", "currency"] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const row = data?.data?.[0]?.d;
    if (!Array.isArray(row) || typeof row[0] !== "number") return null;
    return { price: row[0], dayPct: typeof row[1] === "number" ? row[1] : 0, currency: row[2] ?? null };
  } catch {
    return null;
  }
}

export async function getTradingViewQuoteByIsin(isin: string): Promise<TradingViewQuote | null> {
  const sym = await findTradingViewSymbolByIsin(isin);
  if (!sym) return null;
  return getTradingViewQuote(sym);
}

const EXCHANGE_SUFFIX: Record<string, string> = {
  "Euronext Paris": ".PA",
  "Euronext Amsterdam": ".AS",
  XETR: ".DE",
  GETTEX: ".DE",
  FWB: ".DE",
  LSE: ".L",
};

/** Convertit un symbole TradingView en ticker affiché, suivant la convention déjà utilisée dans l'app (ex: "ESE.PA", "EXX1.DE"). */
export function toDisplayTicker(sym: TradingViewSymbol): string {
  const suffix = EXCHANGE_SUFFIX[sym.exchange];
  return suffix ? `${sym.symbol}${suffix}` : sym.symbol;
}
