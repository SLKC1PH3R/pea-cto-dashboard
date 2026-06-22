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
    matchFragments: ["AM.NASDQ-100", "AMUNDI INDEX SOLUTIONS - NASDAQ-100"],
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
    ticker: "ESE.PA",
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
    ticker: "WPEA.PA",
    isin: "IE0002XZSHO1",
    name: "iShares MSCI World Swap PEA ETF",
    assetType: "ETF_CAPITALISANT",
    sector: "Diversifié",
    region: "Monde",
    currency: "EUR",
  },
  {
    // Fonds Lyxor renommé Amundi en 2021 (même ISIN) — les deux libellés
    // Boursorama existent selon la date de l'opération.
    matchFragments: [
      "AMUNDI PEA NASDAQ-100",
      "LYX.PEA NASDAQ-100",
      "LY.PEANASD.-100UC",
      "LY.PEANASD",
    ],
    ticker: "PUST.PA",
    isin: "FR0011871110",
    name: "Amundi PEA Nasdaq-100 UCITS ETF FCP Parts -Acc-",
    assetType: "ETF_CAPITALISANT",
    sector: "Technologie",
    region: "USA",
    currency: "EUR",
    benchmarkTicker: "QQQ",
  },
  {
    matchFragments: ["AMUNDI NASDAQ-100 DAILY", "AM.P.NASD.100 D.2X", "AM.NASD.100 D.2X"],
    ticker: "LQQ.PA",
    isin: "FR0010342592",
    name: "Amundi NASDAQ-100 Daily (2X) Leveraged UCITS ETF -Acc-",
    assetType: "ETF_CAPITALISANT",
    sector: "Technologie",
    region: "USA",
    currency: "EUR",
    benchmarkTicker: "QQQ",
  },
  {
    matchFragments: ["AMUNDI MSCI WORLD SWAP", "AM.MSCI WORLD UCITS ETF EUR C", "AM.M.WOR.ETF EUR C"],
    ticker: "CW8.PA",
    isin: "LU1681043599",
    name: "Amundi MSCI World Swap -UCITS ETF- Capitalisation",
    assetType: "ETF_CAPITALISANT",
    sector: "Diversifié",
    region: "Monde",
    currency: "EUR",
  },
  {
    matchFragments: ["AMUNDI PEA MSCI EUROPE", "AM.ETF PEA MSCI EUROPE UC.ETF", "AM.ETF MSC.EUR.UC."],
    ticker: "PCEU.PA",
    isin: "FR0013412038",
    name: "Amundi PEA MSCI Europe UCITS ETF FCP Units -Acc-",
    assetType: "ETF_CAPITALISANT",
    sector: "Diversifié",
    region: "Europe",
    currency: "EUR",
  },
  {
    matchFragments: ["AMUNDI PEA EMERGENT", "AM.PEA MSCI EM.MKTS UC.ETF FCP", "AM.PEA MSC.EM M.UC"],
    ticker: "PAEEM.PA",
    isin: "FR0013412020",
    name: "Amundi PEA Emergent (MSCI Emerging) ESG Transition UCITS ETF FCP Units",
    assetType: "ETF_CAPITALISANT",
    sector: "Diversifié",
    region: "Émergents",
    currency: "EUR",
  },
  {
    // Version "Screened"/ESG — distincte de la version "classique" ci-dessous.
    matchFragments: [
      "AMUNDI PEA S&P 500 SCREENED",
      "AM.PEA SP500 ESG UCIT ETF EUR",
      "AM.P.SP500 ESG ACC",
      "AM.P.SP500 ES.EUR",
      "AM.ETF PEA SP500 U.ETF EUR FCP",
    ],
    ticker: "PE500.PA",
    isin: "FR0013412285",
    name: "Amundi PEA S&P 500 Screened UCITS ETF - Acc",
    assetType: "ETF_CAPITALISANT",
    sector: "Diversifié",
    region: "USA",
    currency: "EUR",
    benchmarkTicker: "SPY",
  },
  {
    // Version "classique" (non ESG) — distincte de la version Screened ci-dessus.
    matchFragments: ["AMUNDI PEA S&P 500 UCITS ETF FCP PARTS", "AM.E.P.SP500 EUR"],
    ticker: "PSP5.PA",
    isin: "FR0011871128",
    name: "Amundi PEA S&P 500 UCITS ETF FCP Parts -Acc-",
    assetType: "ETF_CAPITALISANT",
    sector: "Diversifié",
    region: "USA",
    currency: "EUR",
    benchmarkTicker: "SPY",
  },
  {
    matchFragments: [
      "AMUNDI INDEX SOLUTIONS - EURO STOXX 50",
      "AM.EURO STOX.50 UC.ET.DR EUR C",
      "A.E.ST.50 U.EUR C",
    ],
    ticker: "C50.PA",
    isin: "LU1681047236",
    name: "Amundi Index Solutions - Euro STOXX 50 DR UCITS ETF EUR Cap",
    assetType: "ETF_CAPITALISANT",
    sector: "Diversifié",
    region: "Europe",
    currency: "EUR",
  },
  {
    matchFragments: ["ISHARES EURO STOXX BANKS 30-15", "ISHS ESTXX BNKS.30"],
    ticker: "EXX1.DE",
    isin: "DE0006289309",
    name: "iShares EURO STOXX Banks 30-15 UCITS ETF (DE)",
    assetType: "ETF_DISTRIBUANT",
    sector: "Finance",
    region: "Europe",
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

/**
 * Résout un actif par ISIN — bien plus fiable qu'un nom Boursorama abrégé,
 * quand le document l'indique ("Code ISIN : XXXXXXXXXX").
 */
export function resolveAssetByIsin(isin: string): AssetResolution | null {
  const known = KNOWN_ASSETS.find((a) => a.isin?.toUpperCase() === isin.toUpperCase());
  return known ? { matched: true, asset: known } : null;
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
