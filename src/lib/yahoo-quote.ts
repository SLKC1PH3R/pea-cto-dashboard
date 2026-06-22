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
