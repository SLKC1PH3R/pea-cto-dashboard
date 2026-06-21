/**
 * Boursorama affiche des noms commerciaux abrégés ("ISHS COR MSCI WLD",
 * "AM.NASDQ-100 SW.UC") plutôt que des tickers exploitables par Finnhub.
 * Cette table de correspondance permet de retrouver le bon ticker/ISIN à
 * partir du nom partiel détecté dans le relevé.
 *
 * À enrichir au fil des imports : si un nom n'est pas reconnu, l'import le
 * signale en warning et permet une résolution manuelle plutôt que de planter.
 */

export type KnownAsset = {
  /** Fragments du nom Boursorama qui permettent d'identifier l'actif (match "contains", insensible à la casse) */
  matchFragments: string[];
  /**
   * Ticker Finnhub, si connu avec certitude. Laisser vide quand on connaît
   * le fonds (nom + ISIN, fournis par l'utilisateur) mais pas le ticker
   * exact : il sera résolu automatiquement via une recherche Finnhub par
   * ISIN au moment de l'import, et signalé comme suggestion à vérifier.
   */
  ticker?: string;
  isin?: string;
  name: string;
  assetType: "ACTION" | "ETF_DISTRIBUANT" | "ETF_CAPITALISANT";
  sector?: string;
  region?: string;
  currency: string;
  benchmarkTicker?: string;
};

export const KNOWN_ASSETS: KnownAsset[] = [
  {
    matchFragments: ["ISHS COR MSCI WLD", "ISHARES CORE MSCI WORLD"],
    ticker: "IWDA.AS",
    isin: "IE00B4L5Y983",
    name: "iShares Core MSCI World",
    assetType: "ETF_CAPITALISANT",
    sector: "Diversifié",
    region: "Monde",
    currency: "EUR",
  },
  {
    matchFragments: ["AM.NASDQ-100", "AMUNDI NASDAQ"],
    ticker: "ANX.PA",
    isin: "LU1681038243",
    name: "Amundi Nasdaq-100",
    assetType: "ETF_CAPITALISANT",
    sector: "Technologie",
    region: "USA",
    currency: "EUR",
    benchmarkTicker: "QQQ",
  },
  {
    matchFragments: ["ISHS VI-ISMWSPE", "ISHARES MSCI WORLD SMALL CAP"],
    ticker: "IUSN.DE",
    isin: "IE00BF4RFH31",
    name: "iShares MSCI World Small Cap",
    assetType: "ETF_CAPITALISANT",
    sector: "Diversifié",
    region: "Monde",
    currency: "EUR",
  },
  {
    matchFragments: ["PHYSICAL SILVER"],
    ticker: "PHAG.L",
    isin: "IE00B4NCWG09",
    name: "WisdomTree Physical Silver",
    assetType: "ETF_CAPITALISANT",
    sector: "Matières premières",
    region: "Monde",
    currency: "USD",
  },
  {
    matchFragments: ["META PLATFORMS"],
    ticker: "META",
    isin: "US30303M1027",
    name: "Meta Platforms",
    assetType: "ACTION",
    sector: "Technologie",
    region: "USA",
    currency: "USD",
  },
  {
    matchFragments: ["NVIDIA"],
    ticker: "NVDA",
    isin: "US67066G1040",
    name: "NVIDIA",
    assetType: "ACTION",
    sector: "Technologie",
    region: "USA",
    currency: "USD",
  },
  {
    matchFragments: ["TAIWAN SEMI"],
    ticker: "TSM",
    isin: "US8740391003",
    name: "Taiwan Semiconductor (ADR)",
    assetType: "ACTION",
    sector: "Technologie",
    region: "Asie",
    currency: "USD",
  },
  {
    matchFragments: ["BNPP S&P500EUR ETF", "BNPP EASY S&P 500", "BNP PARIBAS EASY S&P 500"],
    isin: "FR0011550185",
    name: "BNP Paribas Easy S&P 500 ETF EUR (C)",
    assetType: "ETF_CAPITALISANT",
    sector: "Diversifié",
    region: "USA",
    currency: "EUR",
    benchmarkTicker: "SPY",
  },
  {
    matchFragments: ["ISHARES MSCI WORLD SWAP PEA ETF", "ISHS MSCI WORLD SWAP"],
    isin: "IE0002XZSHO1",
    name: "iShares MSCI World Swap PEA ETF",
    assetType: "ETF_CAPITALISANT",
    sector: "Diversifié",
    region: "Monde",
    currency: "EUR",
  },
];

export type AssetResolution =
  | { matched: true; asset: KnownAsset }
  | { matched: false; rawName: string };

/** Retrouve l'ISIN connu d'un ticker (utile pour un repli de cotation par ISIN, ex: boursorama.com). */
export function findIsinByTicker(ticker: string): string | null {
  const known = KNOWN_ASSETS.find((a) => a.ticker?.toUpperCase() === ticker.toUpperCase());
  return known?.isin ?? null;
}

export function resolveAssetName(rawName: string): AssetResolution {
  const normalized = rawName.toUpperCase();

  for (const known of KNOWN_ASSETS) {
    if (known.matchFragments.some((f) => normalized.includes(f.toUpperCase()))) {
      return { matched: true, asset: known };
    }
  }

  return { matched: false, rawName };
}
