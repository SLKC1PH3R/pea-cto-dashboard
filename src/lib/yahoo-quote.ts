/**
 * Cotation de repli via l'API non officielle "chart" de Yahoo Finance —
 * gratuite, sans clé, et accepte directement nos tickers au format déjà
 * utilisé dans l'app (ex: "WPEA.PA", "ESE.PA", "IUSN.DE"). Contrairement à
 * tradingview.com/boursorama.com, elle n'a pas besoin d'une recherche par
 * ISIN préalable puisqu'on lui donne le ticker qu'on connaît déjà — un seul
 * appel direct. Fragile par nature (API non documentée) : toute erreur
 * renvoie simplement `null`.
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (compatible; FolioDashboard/1.0)";

export type YahooQuote = {
  price: number;
  dayPct: number;
};

export async function getYahooQuote(ticker: string): Promise<YahooQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== "number") return null;
    const prevClose = typeof meta.previousClose === "number" ? meta.previousClose : meta.chartPreviousClose;
    const dayPct = typeof prevClose === "number" && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    return { price, dayPct };
  } catch {
    return null;
  }
}

export async function getYahooQuotes(tickers: string[]): Promise<Record<string, YahooQuote>> {
  const results = await Promise.all(tickers.map(async (t) => [t, await getYahooQuote(t)] as const));
  const out: Record<string, YahooQuote> = {};
  for (const [t, q] of results) {
    if (q) out[t] = q;
  }
  return out;
}

/**
 * Historique des cours de clôture mensuels, pour reconstruire une courbe de
 * valorisation passée du portefeuille (sans fabriquer de variation : si
 * Yahoo ne couvre pas l'actif, on renvoie `null` et l'appelant doit replier
 * sur le PRU à la date concernée). Clé = "YYYY-MM", valeur = dernier cours
 * de clôture connu de ce mois.
 */
export async function getYahooMonthlyHistory(ticker: string): Promise<Record<string, number> | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=max`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const timestamps: number[] | undefined = result?.timestamp;
    const closes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close;
    if (!timestamps || !closes) return null;
    const out: Record<string, number> = {};
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (typeof close !== "number") continue;
      const d = new Date(timestamps[i] * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out[key] = close;
    }
    return out;
  } catch {
    return null;
  }
}

export async function getYahooMonthlyHistories(tickers: string[]): Promise<Record<string, Record<string, number>>> {
  const results = await Promise.all(tickers.map(async (t) => [t, await getYahooMonthlyHistory(t)] as const));
  const out: Record<string, Record<string, number>> = {};
  for (const [t, h] of results) {
    if (h) out[t] = h;
  }
  return out;
}

/**
 * Historique des cours de clôture quotidiens — utilisé pour calculer un TWR
 * "maison" (cf. `computeSelfTwrPct` dans dashboard-data.ts) quand aucun
 * export CSV du courtier n'a été importé. Clé = "YYYY-MM-DD".
 */
export async function getYahooDailyHistory(ticker: string): Promise<Record<string, number> | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=max`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const timestamps: number[] | undefined = result?.timestamp;
    const closes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close;
    if (!timestamps || !closes) return null;
    const out: Record<string, number> = {};
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (typeof close !== "number") continue;
      out[new Date(timestamps[i] * 1000).toISOString().slice(0, 10)] = close;
    }
    return out;
  } catch {
    return null;
  }
}

export async function getYahooDailyHistories(tickers: string[]): Promise<Record<string, Record<string, number>>> {
  const results = await Promise.all(tickers.map(async (t) => [t, await getYahooDailyHistory(t)] as const));
  const out: Record<string, Record<string, number>> = {};
  for (const [t, h] of results) {
    if (h) out[t] = h;
  }
  return out;
}
