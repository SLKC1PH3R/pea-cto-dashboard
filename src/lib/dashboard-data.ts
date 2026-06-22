import { prisma } from "@/lib/prisma";
import { getQuotes } from "@/lib/finnhub";
import { getBoursoramaQuoteByIsin, type BoursoramaQuote } from "@/lib/boursorama-quote";
import { getTradingViewQuoteByIsin, type TradingViewQuote } from "@/lib/tradingview-quote";
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
} from "@/components/dashboard/atelier-data";
import { PEA_CAP } from "@/components/dashboard/atelier-data";

const ASSET_TYPE_LABEL: Record<string, string> = {
  ACTION: "Actions",
  ETF_DISTRIBUANT: "ETF",
  ETF_CAPITALISANT: "ETF",
};

const ALLOC_COLORS = ["#a78bfa", "#c9b6fb", "#6ea8c9", "#c9a978", "#5fb89a"];
const SECTOR_COLORS = ["#a78bfa", "#c9b6fb", "#6ea8c9", "#c9a978", "#5fb89a", "#e0a85f", "#8f8799"];

type PriceSource = "live" | "tradingview" | "boursorama" | "manual" | "pru";

/**
 * Cours courant d'un actif, par ordre de priorité : cotation Finnhub, sinon
 * tradingview.com (repli le plus complet pour les ETF européens non
 * couverts par Finnhub en plan gratuit), sinon boursorama.com (n'indexe pas
 * tous les fonds), sinon cours saisi manuellement par l'utilisateur, sinon
 * repli sur le PRU (pas de variation fabriquée — on ne connaît juste pas le
 * prix actuel).
 */
function resolvePrice(
  quote: { c: number; dp: number } | undefined,
  tradingViewQuote: TradingViewQuote | undefined,
  boursoramaQuote: BoursoramaQuote | undefined,
  manualPrice: { toNumber(): number } | null,
  pru: number
): { price: number; day: number; source: PriceSource } {
  if (quote) return { price: quote.c, day: quote.dp, source: "live" };
  if (tradingViewQuote) return { price: tradingViewQuote.price, day: tradingViewQuote.dayPct, source: "tradingview" };
  if (boursoramaQuote) return { price: boursoramaQuote.price, day: boursoramaQuote.dayPct, source: "boursorama" };
  if (manualPrice) return { price: manualPrice.toNumber(), day: 0, source: "manual" };
  return { price: pru, day: 0, source: "pru" };
}

function buildMonthlyCumulativeDeposits(deposits: { amount: { toNumber(): number }; date: Date }[]): number[] {
  if (deposits.length === 0) return [0, 0];
  const sorted = [...deposits].sort((a, b) => a.date.getTime() - b.date.getTime());
  const monthly = new Map<string, number>();
  let running = 0;
  for (const d of sorted) {
    running += d.amount.toNumber();
    const key = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, "0")}`;
    monthly.set(key, running);
  }
  const values = Array.from(monthly.values());
  return values.length >= 2 ? values : [0, ...values];
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

  // ── Repli tradingview.com puis boursorama.com pour les actifs sans
  // cotation Finnhub (ETF Euronext non couverts par le plan gratuit),
  // identifiés par leur ISIN.
  const assetsByTicker = new Map(allPositions.map((p) => [p.asset.ticker, p.asset]));
  const missingWithIsin = [...assetsByTicker.values()].filter((a) => !quotes[a.ticker] && a.isin);

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
  const atelierPositions: AtelierPosition[] = [];
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
    if (qty <= 0) continue; // position clôturée (vendue intégralement)

    const pru = averageCostPrice(txs);
    const quote = quotes[position.asset.ticker];
    const { price: currentPrice, day: dayPct, source: priceSource } = resolvePrice(
      quote,
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

  // ── Frais réels
  const fees = accounts.flatMap((a) => a.fees);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const feesLast12m = fees.filter((f) => f.date >= oneYearAgo).reduce((s, f) => s + f.amount.toNumber(), 0);
  const feeItemsMap = new Map<string, number>();
  for (const f of fees) feeItemsMap.set(f.type, (feeItemsMap.get(f.type) ?? 0) + f.amount.toNumber());

  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? totalPnl / totalCost : 0;
  const dayPct = totalValue > 0 ? (dayAbsSum / totalValue) * 100 : 0;

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

  // ── Watchlist : cotation Finnhub si disponible, sinon repli tradingview.com
  // puis boursorama.com (via l'ISIN connu du ticker), sinon cours saisi
  // manuellement — un actif suivi reste affiché même sans aucune source
  // automatique (prix "—").
  const watchlistItems = await prisma.watchlistItem.findMany({ where: { userId } });
  const watchlistTickers = watchlistItems.map((w) => w.ticker);
  const watchlistQuotes = watchlistTickers.length > 0 ? await getQuotes(watchlistTickers) : {};

  const watchlistMissing = watchlistItems.filter((w) => !watchlistQuotes[w.ticker]);
  const watchlistTradingViewResults = await Promise.all(
    watchlistMissing.map(async (w) => {
      const isin = findIsinByTicker(w.ticker);
      return [w.ticker, isin ? await getTradingViewQuoteByIsin(isin) : null] as const;
    })
  );
  const watchlistTradingViewQuotes: Record<string, TradingViewQuote> = {};
  for (const [ticker, q] of watchlistTradingViewResults) {
    if (q) watchlistTradingViewQuotes[ticker] = q;
  }

  const watchlistStillMissing = watchlistMissing.filter((w) => !watchlistTradingViewQuotes[w.ticker]);
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
    const tvq = watchlistTradingViewQuotes[w.ticker];
    const bq = watchlistBoursoramaQuotes[w.ticker];
    if (q) return { name: w.name ?? w.ticker, ticker: w.ticker, cls: "Watchlist", price: q.c, day: q.dp, priceSource: "live" };
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
    evo: buildMonthlyCumulativeDeposits(deposits),
    alloc,
    positions: atelierPositions,
    gainers,
    losers,
    tx,
    dateLabel: new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }),
    sectors,
    accounts: accountSummaries,
    watchlist,
  };
}
