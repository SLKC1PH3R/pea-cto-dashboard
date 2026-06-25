/**
 * Client Finnhub minimal — cotation temps réel + résolution de symboles.
 * Doc API : https://finnhub.io/docs/api
 *
 * Note : le plan gratuit Finnhub limite l'historique de prix (candles) aux
 * actions US. Pour les ETF UCITS européens (Boursorama/TR), on s'appuie
 * surtout sur `quote()` pour le prix courant, et on alimente PriceHistory
 * nous-mêmes au fil du temps (cache local) pour reconstruire un historique.
 */

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

function getApiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    throw new Error(
      "FINNHUB_API_KEY manquant. Ajoute ta clé dans .env (https://finnhub.io)"
    );
  }
  return key;
}

export type FinnhubQuote = {
  c: number; // current price
  d: number; // change
  dp: number; // percent change
  h: number; // high of the day
  l: number; // low of the day
  o: number; // open price of the day
  pc: number; // previous close
  t: number; // timestamp
};

export async function getQuote(symbol: string): Promise<FinnhubQuote> {
  const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${getApiKey()}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Finnhub quote() a échoué pour ${symbol}: ${res.status}`);
  }

  return res.json();
}

export async function getQuotes(symbols: string[]): Promise<Record<string, FinnhubQuote>> {
  const results = await Promise.all(
    symbols.map(async (s) => {
      try {
        const q = await getQuote(s);
        return [s, q] as const;
      } catch {
        return [s, null] as const;
      }
    })
  );

  const out: Record<string, FinnhubQuote> = {};
  for (const [symbol, quote] of results) {
    // Finnhub renvoie un 200 avec tous les champs à 0 pour un symbole non
    // couvert par le plan gratuit (ex: cryptos) plutôt qu'une erreur — un
    // prix à 0 n'est jamais un cours réel valide, on le traite comme une
    // absence de donnée pour laisser le repli Yahoo/tradingview prendre le relais.
    if (quote && quote.c > 0) out[symbol] = quote;
  }
  return out;
}

export type SymbolSearchResult = {
  description: string;
  displaySymbol: string;
  symbol: string;
  type: string;
};

export async function searchSymbol(query: string): Promise<SymbolSearchResult[]> {
  const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(query)}&token=${getApiKey()}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Finnhub search() a échoué pour "${query}": ${res.status}`);
  }

  const data = await res.json();
  return data.result ?? [];
}

export type CompanyProfile = {
  name: string;
  ticker: string;
  finnhubIndustry?: string;
  country?: string;
  currency?: string;
};

export async function getCompanyProfile(symbol: string): Promise<CompanyProfile | null> {
  const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${getApiKey()}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) return null;

  const data = await res.json();
  if (!data || !data.name) return null;

  return data;
}
