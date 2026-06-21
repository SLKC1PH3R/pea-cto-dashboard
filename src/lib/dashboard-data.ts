import { prisma } from "@/lib/prisma";
import { getQuotes } from "@/lib/finnhub";
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
    const currentPrice = quote?.c ?? pru;
    const dayPct = quote?.dp ?? 0;
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
      const currentPrice = quote?.c ?? pru;
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

  // ── Watchlist : cotations réelles via Finnhub pour les tickers suivis
  const watchlistItems = await prisma.watchlistItem.findMany({ where: { userId } });
  const watchlistTickers = watchlistItems.map((w) => w.ticker);
  const watchlistQuotes = watchlistTickers.length > 0 ? await getQuotes(watchlistTickers) : {};
  const watchlist: WatchItem[] = watchlistItems
    .map((w) => {
      const q = watchlistQuotes[w.ticker];
      if (!q) return null;
      return { name: w.name ?? w.ticker, ticker: w.ticker, cls: "Watchlist", price: q.c, day: q.dp };
    })
    .filter((w): w is WatchItem => w !== null);

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
