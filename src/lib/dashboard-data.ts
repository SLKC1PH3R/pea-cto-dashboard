import type { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "@/lib/prisma";
import { getQuotes } from "@/lib/finnhub";
import { getBoursoramaQuoteByIsin, type BoursoramaQuote } from "@/lib/boursorama-quote";
import { getTradingViewQuoteByIsin, type TradingViewQuote } from "@/lib/tradingview-quote";
import { getYahooQuotes, getYahooMonthlyHistories, type YahooQuote } from "@/lib/yahoo-quote";
import { findIsinByTicker } from "@/lib/parsers/asset-mapping";
import { syncAllActiveDcaRules } from "@/lib/dca-sync";
import { currentQuantity, averageCostPrice, totalAcquisitionCost, realizedPnl } from "@/lib/finance-calculations";
import type {
  DashboardData,
  Position as AtelierPosition,
  AllocSlice,
  Mover,
  Sector,
  WatchItem,
  Transaction as AtelierTx,
  AccountSummary,
  ClosedPosition,
} from "@/components/dashboard/atelier-data";
import { PEA_CAP } from "@/components/dashboard/atelier-data";

const ASSET_TYPE_LABEL: Record<string, string> = {
  ACTION: "Actions",
  ETF_DISTRIBUANT: "ETF",
  ETF_CAPITALISANT: "ETF",
};

const ALLOC_COLORS = ["#a78bfa", "#c9b6fb", "#6ea8c9", "#c9a978", "#5fb89a"];
const SECTOR_COLORS = ["#a78bfa", "#c9b6fb", "#6ea8c9", "#c9a978", "#5fb89a", "#e0a85f", "#8f8799"];

type PriceSource = "live" | "yahoo" | "tradingview" | "boursorama" | "manual" | "pru";

/**
 * Cours courant d'un actif, par ordre de priorité : cotation Finnhub, sinon
 * Yahoo Finance (repli le plus simple — accepte directement notre ticker,
 * pas de recherche par ISIN nécessaire), sinon tradingview.com (par ISIN),
 * sinon boursorama.com (n'indexe pas tous les fonds), sinon cours saisi
 * manuellement par l'utilisateur, sinon repli sur le PRU (pas de variation
 * fabriquée — on ne connaît juste pas le prix actuel).
 */
function resolvePrice(
  quote: { c: number; dp: number } | undefined,
  yahooQuote: YahooQuote | undefined,
  tradingViewQuote: TradingViewQuote | undefined,
  boursoramaQuote: BoursoramaQuote | undefined,
  manualPrice: { toNumber(): number } | null,
  pru: number
): { price: number; day: number; source: PriceSource } {
  if (quote) return { price: quote.c, day: quote.dp, source: "live" };
  if (yahooQuote) return { price: yahooQuote.price, day: yahooQuote.dayPct, source: "yahoo" };
  if (tradingViewQuote) return { price: tradingViewQuote.price, day: tradingViewQuote.dayPct, source: "tradingview" };
  if (boursoramaQuote) return { price: boursoramaQuote.price, day: boursoramaQuote.dayPct, source: "boursorama" };
  if (manualPrice) return { price: manualPrice.toNumber(), day: 0, source: "manual" };
  return { price: pru, day: 0, source: "pru" };
}

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Toutes les clés "YYYY-MM" entre deux dates, mois calendaires complets (bornes incluses). */
function monthKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    keys.push(ymKey(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

/** Capital versé cumulé, un point par mois calendaire de `monthKeys` (reporté si pas de dépôt ce mois-là). */
function buildMonthlyCumulativeDeposits(
  deposits: { amount: { toNumber(): number }; date: Date }[],
  monthKeys: string[]
): number[] {
  const byMonth = new Map<string, number>();
  for (const d of deposits) {
    const key = ymKey(d.date);
    byMonth.set(key, (byMonth.get(key) ?? 0) + d.amount.toNumber());
  }
  let running = 0;
  return monthKeys.map((key) => {
    running += byMonth.get(key) ?? 0;
    return running;
  });
}

/** Replie sur le cours mensuel connu le plus proche dans le passé (jamais vers l'avenir) — pas de variation fabriquée. */
function nearestHistoricalPrice(history: Record<string, number>, key: string): number | undefined {
  if (history[key] !== undefined) return history[key];
  let [y, m] = key.split("-").map(Number);
  for (let i = 0; i < 12; i++) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    const k = `${y}-${String(m).padStart(2, "0")}`;
    if (history[k] !== undefined) return history[k];
  }
  return undefined;
}

/**
 * Reconstruit la valeur totale réelle du portefeuille (titres + cash) mois
 * par mois, à partir de la quantité réellement détenue à chaque date (connue
 * avec certitude via l'historique des transactions) et des cours de clôture
 * mensuels Yahoo Finance. Si Yahoo ne couvre pas le mois/l'actif, on replie
 * sur le PRU à cette date plutôt que d'inventer un cours. C'est une
 * APPROXIMATION — utilisée seulement quand on n'a pas mieux (cf.
 * `buildMonthlyTotalValueSeries` ci-dessous, qui préfère les vraies
 * valorisations importées via CSV quand elles existent).
 */
async function buildEstimatedMonthlySeries(
  monthKeys: string[],
  positions: { asset: { ticker: string }; transactions: { type: "BUY" | "SELL"; quantity: Decimal; price: Decimal; fees: Decimal; date: Date }[] }[],
  depositsCumulative: number[]
): Promise<number[]> {
  const tickers = [...new Set(positions.map((p) => p.asset.ticker))];
  const histories = tickers.length > 0 ? await getYahooMonthlyHistories(tickers) : {};

  return monthKeys.map((key, i) => {
    const [y, m] = key.split("-").map(Number);
    const cutoff = new Date(y, m, 0, 23, 59, 59, 999); // dernier instant du mois `key`
    let marketValue = 0;
    let costBasis = 0;
    for (const position of positions) {
      const txsUpToDate = position.transactions.filter((t) => t.date <= cutoff);
      if (txsUpToDate.length === 0) continue;
      const qty = currentQuantity(txsUpToDate);
      costBasis += totalAcquisitionCost(txsUpToDate);
      if (qty <= 0) continue;
      const history = histories[position.asset.ticker];
      const histPrice = history ? nearestHistoricalPrice(history, key) : undefined;
      const price = histPrice ?? averageCostPrice(txsUpToDate);
      marketValue += qty * price;
    }
    const cash = Math.max(depositsCumulative[i] - costBasis, 0);
    return marketValue + cash;
  });
}

/** Valorisation réelle la plus proche d'une date cible, si elle tombe dans la tolérance (sinon `null` — pas d'extrapolation). */
function findNearestSnapshotValue(snapshots: { date: Date; value: number }[], target: Date, toleranceDays: number): number | null {
  let best: { date: Date; value: number } | null = null;
  let bestDiffMs = Infinity;
  for (const s of snapshots) {
    const diff = Math.abs(s.date.getTime() - target.getTime());
    if (diff < bestDiffMs) {
      bestDiffMs = diff;
      best = s;
    }
  }
  if (!best) return null;
  return bestDiffMs <= toleranceDays * 24 * 60 * 60 * 1000 ? best.value : null;
}

/**
 * Valeur totale réelle du portefeuille, mois par mois — préfère la vraie
 * valorisation importée du courtier (PortfolioSnapshot, cf. CSV "Performance")
 * quand TOUS les comptes de l'utilisateur ont un point réel à ±5 jours du
 * mois concerné, et replie sur `buildEstimatedMonthlySeries` sinon. On ne
 * mélange jamais réel et estimé au sein d'un même mois (mauvaise lisibilité
 * sinon : un mois "moitié vrai moitié deviné" n'a pas de sens à interpréter).
 */
async function buildMonthlyTotalValueSeries(
  monthKeys: string[],
  positions: { asset: { ticker: string }; transactions: { type: "BUY" | "SELL"; quantity: Decimal; price: Decimal; fees: Decimal; date: Date }[] }[],
  depositsCumulative: number[],
  accountIds: string[],
  snapshotsByAccount: Map<string, { date: Date; value: number }[]>
): Promise<number[]> {
  const estimated = await buildEstimatedMonthlySeries(monthKeys, positions, depositsCumulative);
  if (snapshotsByAccount.size === 0 || accountIds.length === 0) return estimated;

  return monthKeys.map((key, i) => {
    const [y, m] = key.split("-").map(Number);
    const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);

    let sum = 0;
    for (const accountId of accountIds) {
      const snaps = snapshotsByAccount.get(accountId);
      if (!snaps || snaps.length === 0) return estimated[i];
      const nearest = findNearestSnapshotValue(snaps, monthEnd, 5);
      if (nearest === null) return estimated[i];
      sum += nearest;
    }
    return sum;
  });
}

export async function getDashboardData(userId: string, userEmail: string | null | undefined): Promise<DashboardData> {
  // Rattrape les exécutions DCA manquantes depuis la dernière visite — pas
  // besoin de revenir sur /import chaque semaine pour relancer un plan actif.
  await syncAllActiveDcaRules(userId);

  const user = await prisma.user.findUnique({ where: { id: userId } });

  const accounts = await prisma.account.findMany({
    where: { userId },
    include: {
      deposits: true,
      fees: true,
      positions: { include: { asset: true, transactions: true, dividends: true } },
    },
  });

  // ── Positions : quantité/PRU/valeur réels, prix courant via Finnhub si
  // disponible, sinon repli sur le PRU (pas de fabrication de variation).
  const allPositions = accounts.flatMap((a) => a.positions);
  const tickers = [...new Set(allPositions.map((p) => p.asset.ticker))];
  const quotes = tickers.length > 0 ? await getQuotes(tickers) : {};

  // ── Repli Yahoo Finance (direct par ticker), puis tradingview.com puis
  // boursorama.com (par ISIN) pour les actifs sans cotation Finnhub (ETF
  // Euronext non couverts par le plan gratuit).
  const assetsByTicker = new Map(allPositions.map((p) => [p.asset.ticker, p.asset]));
  const missingTickers = [...assetsByTicker.values()].filter((a) => !quotes[a.ticker]).map((a) => a.ticker);
  const yahooQuotes = missingTickers.length > 0 ? await getYahooQuotes(missingTickers) : {};

  const missingWithIsin = [...assetsByTicker.values()].filter((a) => !quotes[a.ticker] && !yahooQuotes[a.ticker] && a.isin);

  const tradingViewResults = await Promise.all(
    missingWithIsin.map(async (a) => [a.ticker, await getTradingViewQuoteByIsin(a.isin!)] as const)
  );
  const tradingViewQuotes: Record<string, TradingViewQuote> = {};
  for (const [ticker, q] of tradingViewResults) {
    if (q) tradingViewQuotes[ticker] = q;
  }

  const stillMissing = missingWithIsin.filter((a) => !tradingViewQuotes[a.ticker]);
  const boursoramaResults = await Promise.all(
    stillMissing.map(async (a) => [a.ticker, await getBoursoramaQuoteByIsin(a.isin!)] as const)
  );
  const boursoramaQuotes: Record<string, BoursoramaQuote> = {};
  for (const [ticker, q] of boursoramaResults) {
    if (q) boursoramaQuotes[ticker] = q;
  }

  let totalValue = 0;
  let totalCost = 0;
  let dayAbsSum = 0;
  let totalRealizedPnl = 0; // plus/moins-values réalisées cumulées, positions ouvertes ET clôturées
  const atelierPositions: AtelierPosition[] = [];
  const closedPositions: ClosedPosition[] = []; // positions intégralement vendues (qty = 0)
  const allocMap = new Map<string, number>();
  const sectorMap = new Map<string, number>();

  for (const position of allPositions) {
    const txs = position.transactions.map((t) => ({
      type: t.type,
      quantity: t.quantity,
      price: t.price,
      fees: t.fees,
      date: t.date,
    }));
    const qty = currentQuantity(txs);
    // Le P&L réalisé (sur les ventes passées) compte même si la position
    // reste partiellement ouverte (ex: WPEA.PA vendu puis racheté) — il ne
    // faut donc pas se limiter aux positions intégralement clôturées.
    const realizedOnThis = realizedPnl(txs);
    totalRealizedPnl += realizedOnThis;

    if (qty <= 0) {
      // Position clôturée (vendue intégralement) — pas de cours/valeur de
      // marché à afficher, mais la plus-value réalisée doit rester visible.
      if (realizedOnThis !== 0) {
        closedPositions.push({
          name: position.asset.name,
          ticker: position.asset.ticker,
          sector: position.asset.sector ?? "Autre",
          realizedPnl: realizedOnThis,
        });
      }
      continue;
    }

    const pru = averageCostPrice(txs);
    const quote = quotes[position.asset.ticker];
    const { price: currentPrice, day: dayPct, source: priceSource } = resolvePrice(
      quote,
      yahooQuotes[position.asset.ticker],
      tradingViewQuotes[position.asset.ticker],
      boursoramaQuotes[position.asset.ticker],
      position.asset.manualPrice,
      pru
    );
    const marketValue = qty * currentPrice;
    const cost = totalAcquisitionCost(txs);

    totalValue += marketValue;
    totalCost += cost;
    dayAbsSum += marketValue * (dayPct / 100);

    const clsLabel = ASSET_TYPE_LABEL[position.asset.assetType] ?? position.asset.assetType;
    allocMap.set(clsLabel, (allocMap.get(clsLabel) ?? 0) + marketValue);

    const sectorLabel = position.asset.sector ?? "Autre";
    sectorMap.set(sectorLabel, (sectorMap.get(sectorLabel) ?? 0) + marketValue);

    atelierPositions.push({
      name: position.asset.name,
      ticker: position.asset.ticker,
      cls: clsLabel,
      sector: sectorLabel,
      qty,
      pru,
      price: currentPrice,
      day: dayPct,
      priceSource,
    });
  }

  // ── Résumé par compte : plafond réglementaire (PEA), capital déposé,
  // disponible, valeur actuelle et PnL (latent + réalisé sur les ventes).
  const accountSummaries: AccountSummary[] = accounts.map((account) => {
    let marketValue = 0;
    let cost = 0;
    let realized = 0;
    for (const position of account.positions) {
      const txs = position.transactions.map((t) => ({
        type: t.type,
        quantity: t.quantity,
        price: t.price,
        fees: t.fees,
        date: t.date,
      }));
      const qty = currentQuantity(txs);
      const quote = quotes[position.asset.ticker];
      const pru = averageCostPrice(txs);
      const { price: currentPrice } = resolvePrice(
        quote,
        yahooQuotes[position.asset.ticker],
        tradingViewQuotes[position.asset.ticker],
        boursoramaQuotes[position.asset.ticker],
        position.asset.manualPrice,
        pru
      );
      marketValue += qty * currentPrice;
      cost += totalAcquisitionCost(txs);
      realized += realizedPnl(txs);
    }
    const deposited = account.deposits.reduce((sum, d) => sum + d.amount.toNumber(), 0);
    const accountCash = Math.max(deposited - cost, 0);
    const unrealized = marketValue - cost;
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      plafond: account.type === "PEA" ? PEA_CAP : null,
      deposited,
      cash: accountCash,
      marketValue,
      total: marketValue + accountCash,
      unrealizedPnl: unrealized,
      realizedPnl: realized,
      totalPnl: unrealized + realized,
    };
  });

  // ── Liquidités : approximation à partir des dépôts réels moins le coût
  // d'acquisition des positions détenues (pas de suivi direct du solde cash).
  const deposits = accounts.flatMap((a) => a.deposits);
  const totalDeposited = deposits.reduce((sum, d) => sum + d.amount.toNumber(), 0);
  const cash = Math.max(totalDeposited - totalCost, 0);

  // ── Évolution mensuelle : capital versé cumulé vs valeur totale réelle
  // reconstruite (titres au cours historique + cash), pour montrer l'effet
  // des plus/moins-values dans le temps et pas seulement les versements.
  const now = new Date();
  const monthKeys =
    deposits.length === 0
      ? [ymKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymKey(now)]
      : monthKeysBetween(
          deposits.reduce((min, d) => (d.date < min ? d.date : min), deposits[0].date),
          now
        );
  const evo = buildMonthlyCumulativeDeposits(deposits, monthKeys);

  const rawSnapshots = await prisma.portfolioSnapshot.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) } },
    select: { accountId: true, date: true, value: true },
    orderBy: { date: "asc" },
  });
  const snapshotsByAccount = new Map<string, { date: Date; value: number }[]>();
  for (const s of rawSnapshots) {
    const arr = snapshotsByAccount.get(s.accountId) ?? [];
    arr.push({ date: s.date, value: s.value.toNumber() });
    snapshotsByAccount.set(s.accountId, arr);
  }
  const evoTotal = await buildMonthlyTotalValueSeries(
    monthKeys,
    allPositions,
    evo,
    accounts.map((a) => a.id),
    snapshotsByAccount
  );

  // ── Frais réels
  const fees = accounts.flatMap((a) => a.fees);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const feesLast12m = fees.filter((f) => f.date >= oneYearAgo).reduce((s, f) => s + f.amount.toNumber(), 0);
  const feeItemsMap = new Map<string, number>();
  for (const f of fees) feeItemsMap.set(f.type, (feeItemsMap.get(f.type) ?? 0) + f.amount.toNumber());

  const totalPnl = totalValue - totalCost;
  const dayPct = totalValue > 0 ? (dayAbsSum / totalValue) * 100 : 0;

  // ── Performance globale = (capitalisation totale - montant déposé) / montant
  // déposé — pas un TWR (les tentatives de TWR "maison"/courtier produisaient
  // des écarts aberrants sur les premiers mois, où le portefeuille démarre
  // avec un capital quasi nul et fait diverger toute méthode basée sur un
  // chaînage de ratios). Simple, robuste, et c'est explicitement la
  // comparaison demandée : capital total réel vs argent réellement versé.
  const totalPnlPct = totalDeposited > 0 ? (totalValue + cash - totalDeposited) / totalDeposited : 0;

  // ── Allocation par type d'actif (+ liquidités)
  const allocTotal = totalValue + cash;
  const alloc: AllocSlice[] = Array.from(allocMap.entries()).map(([label, value], i) => ({
    label,
    pct: allocTotal > 0 ? Math.round((value / allocTotal) * 100) : 0,
    color: ALLOC_COLORS[i % ALLOC_COLORS.length],
  }));
  if (cash > 0) {
    alloc.push({ label: "Liquidités", pct: allocTotal > 0 ? Math.round((cash / allocTotal) * 100) : 0, color: "#8f8799" });
  }

  // ── Répartition sectorielle réelle (Asset.sector), par valeur de marché
  const sectors: Sector[] = Array.from(sectorMap.entries())
    .map(([label, value], i) => ({
      label,
      pct: totalValue > 0 ? Math.round((value / totalValue) * 100) : 0,
      color: SECTOR_COLORS[i % SECTOR_COLORS.length],
    }))
    .sort((a, b) => b.pct - a.pct);

  // ── Watchlist : cotation Finnhub si disponible, sinon Yahoo Finance
  // (direct par ticker), sinon tradingview.com puis boursorama.com (via
  // l'ISIN connu du ticker), sinon cours saisi manuellement — un actif suivi
  // reste affiché même sans aucune source automatique (prix "—").
  const watchlistItems = await prisma.watchlistItem.findMany({ where: { userId } });
  const watchlistTickers = watchlistItems.map((w) => w.ticker);
  const watchlistQuotes = watchlistTickers.length > 0 ? await getQuotes(watchlistTickers) : {};

  const watchlistMissing = watchlistItems.filter((w) => !watchlistQuotes[w.ticker]);
  const watchlistYahooQuotes =
    watchlistMissing.length > 0 ? await getYahooQuotes(watchlistMissing.map((w) => w.ticker)) : {};

  const watchlistMissingAfterYahoo = watchlistMissing.filter((w) => !watchlistYahooQuotes[w.ticker]);
  const watchlistTradingViewResults = await Promise.all(
    watchlistMissingAfterYahoo.map(async (w) => {
      const isin = findIsinByTicker(w.ticker);
      return [w.ticker, isin ? await getTradingViewQuoteByIsin(isin) : null] as const;
    })
  );
  const watchlistTradingViewQuotes: Record<string, TradingViewQuote> = {};
  for (const [ticker, q] of watchlistTradingViewResults) {
    if (q) watchlistTradingViewQuotes[ticker] = q;
  }

  const watchlistStillMissing = watchlistMissingAfterYahoo.filter((w) => !watchlistTradingViewQuotes[w.ticker]);
  const watchlistBoursoramaResults = await Promise.all(
    watchlistStillMissing.map(async (w) => {
      const isin = findIsinByTicker(w.ticker);
      return [w.ticker, isin ? await getBoursoramaQuoteByIsin(isin) : null] as const;
    })
  );
  const watchlistBoursoramaQuotes: Record<string, BoursoramaQuote> = {};
  for (const [ticker, q] of watchlistBoursoramaResults) {
    if (q) watchlistBoursoramaQuotes[ticker] = q;
  }

  const watchlist: WatchItem[] = watchlistItems.map((w) => {
    const q = watchlistQuotes[w.ticker];
    const yq = watchlistYahooQuotes[w.ticker];
    const tvq = watchlistTradingViewQuotes[w.ticker];
    const bq = watchlistBoursoramaQuotes[w.ticker];
    if (q) return { name: w.name ?? w.ticker, ticker: w.ticker, cls: "Watchlist", price: q.c, day: q.dp, priceSource: "live" };
    if (yq) return { name: w.name ?? w.ticker, ticker: w.ticker, cls: "Watchlist", price: yq.price, day: yq.dayPct, priceSource: "yahoo" };
    if (tvq) return { name: w.name ?? w.ticker, ticker: w.ticker, cls: "Watchlist", price: tvq.price, day: tvq.dayPct, priceSource: "tradingview" };
    if (bq) return { name: w.name ?? w.ticker, ticker: w.ticker, cls: "Watchlist", price: bq.price, day: bq.dayPct, priceSource: "boursorama" };
    if (w.manualPrice) {
      return { name: w.name ?? w.ticker, ticker: w.ticker, cls: "Watchlist", price: w.manualPrice.toNumber(), day: 0, priceSource: "manual" };
    }
    return { name: w.name ?? w.ticker, ticker: w.ticker, cls: "Watchlist", price: null, day: null, priceSource: "none" };
  });

  // ── Top hausses / baisses du jour, à partir des positions réelles
  const sortedByDay = [...atelierPositions].sort((a, b) => b.day - a.day);
  const gainers: Mover[] = sortedByDay.slice(0, 3).map((p) => ({ name: p.name, pct: p.day }));
  const losers: Mover[] = sortedByDay
    .slice(-3)
    .reverse()
    .map((p) => ({ name: p.name, pct: p.day }));

  // ── Flux récents : transactions + dividendes + dépôts + frais réels
  type FlatTx = { date: Date; label: string; sub: string; amount: number; type: AtelierTx["type"] };
  const flat: FlatTx[] = [];
  for (const position of allPositions) {
    for (const t of position.transactions) {
      const amount = t.quantity.toNumber() * t.price.toNumber();
      flat.push({
        date: t.date,
        label: `${t.type === "BUY" ? "Achat" : "Vente"} — ${position.asset.name}`,
        sub: `${t.quantity.toNumber()} titres · ${t.price.toNumber().toLocaleString("fr-FR")} €`,
        amount: t.type === "BUY" ? -amount : amount,
        type: t.type === "BUY" ? "buy" : "sell",
      });
    }
    for (const d of position.dividends) {
      flat.push({
        date: d.date,
        label: `Dividende — ${position.asset.name}`,
        sub: "Versement",
        amount: d.netAmount.toNumber(),
        type: "div",
      });
    }
  }
  for (const d of deposits) {
    flat.push({ date: d.date, label: d.note ?? "Versement", sub: "Mouvement de cash", amount: d.amount.toNumber(), type: "in" });
  }
  for (const f of fees) {
    flat.push({ date: f.date, label: f.note ?? "Frais", sub: f.type, amount: -f.amount.toNumber(), type: "fee" });
  }
  flat.sort((a, b) => b.date.getTime() - a.date.getTime());
  const tx: AtelierTx[] = flat.slice(0, 5).map((t) => ({
    label: t.label,
    sub: t.sub,
    amount: t.amount,
    date: t.date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" }),
    type: t.type,
  }));

  return {
    email: userEmail ?? "",
    name: user?.name ?? userEmail?.split("@")[0] ?? "",
    avatarColor: user?.avatarColor ?? null,
    avatarUrl: user?.avatarUrl ?? null,
    birthDate: user?.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
    fireAge: user?.fireAge ?? null,
    total: totalValue + cash,
    invested: totalCost,
    dayAbs: dayAbsSum,
    dayPct,
    totalPnlPct,
    fees: {
      annual: feesLast12m,
      rate: totalValue > 0 ? feesLast12m / totalValue : 0,
      items: Array.from(feeItemsMap.entries()).map(([label, amount]) => ({ label, amount })),
    },
    cash,
    goal: user?.goalAmount ? user.goalAmount.toNumber() : null,
    evo,
    evoTotal,
    alloc,
    positions: atelierPositions,
    gainers,
    losers,
    tx,
    dateLabel: new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }),
    sectors,
    accounts: accountSummaries,
    watchlist,
    totalRealizedPnl,
    closedPositions: closedPositions.sort((a, b) => b.realizedPnl - a.realizedPnl),
  };
}
