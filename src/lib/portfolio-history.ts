import { prisma } from "@/lib/prisma";
import { getYahooDailyHistories } from "@/lib/yahoo-quote";
import { currentQuantity, averageCostPrice } from "@/lib/finance-calculations";
import { nearestDailyPrice, previousTradingDayPrice } from "@/lib/price-history-utils";

export interface HistoryPositionRow {
  ticker: string;
  name: string;
  sector: string;
  cls: string;
  qty: number;
  price: number;
  value: number;
  dayChangeAbs: number;
  dayChangePct: number;
  weight: number;
}

export interface PositionsHistoryResult {
  date: string; // jour effectivement utilisé (peut différer de `requestedDate` si replié sur le jour de bourse précédent)
  requestedDate: string;
  totalValue: number;
  rows: HistoryPositionRow[];
  minDate: string | null; // première date pour laquelle un historique a du sens (1ère transaction)
  maxDate: string; // aujourd'hui
}

const ASSET_TYPE_LABEL: Record<string, string> = {
  ACTION: "Actions",
  ETF_DISTRIBUANT: "ETF",
  ETF_CAPITALISANT: "ETF",
  CRYPTO: "Cryptomonnaies",
};

/**
 * Reconstruit, pour une date donnée, le détail des positions tel qu'il
 * aurait été affiché ce jour-là : quantité réellement détenue (déduite de
 * l'historique des transactions, exact), cours de clôture Yahoo Finance ce
 * jour (replié sur le PRU si Yahoo ne couvre pas l'actif), et variation vs
 * la clôture du jour de bourse précédent. Comme `getDashboardData`, mais
 * paramétré par une date arbitraire dans le passé plutôt que "maintenant".
 */
export async function getPositionsHistoryForDate(userId: string, requestedDate: string): Promise<PositionsHistoryResult> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    include: { positions: { include: { asset: true, transactions: true } } },
  });
  const allPositions = accounts.flatMap((a) => a.positions);

  const allTxDates = allPositions.flatMap((p) => p.transactions.map((t) => t.date));
  const minDate = allTxDates.length > 0 ? allTxDates.reduce((min, d) => (d < min ? d : min)).toISOString().slice(0, 10) : null;
  const maxDate = new Date().toISOString().slice(0, 10);

  const day = requestedDate < maxDate ? requestedDate : maxDate;
  const cutoff = new Date(`${day}T23:59:59.999Z`);

  const tickers = [...new Set(allPositions.map((p) => p.asset.ticker))];
  const histories = tickers.length > 0 ? await getYahooDailyHistories(tickers) : {};

  // Cache local alimenté par le cron /api/cron/refresh-prices — quand il
  // couvre le jour demandé, on le préfère à Yahoo Finance (notre propre
  // capture, cohérente avec le reste de l'appli) ; sinon repli sur Yahoo.
  const cachedPrices =
    tickers.length > 0
      ? await prisma.priceHistory.findMany({
          where: { ticker: { in: tickers }, date: new Date(`${day}T00:00:00.000Z`) },
          select: { ticker: true, close: true },
        })
      : [];
  const cachedByTicker = new Map(cachedPrices.map((p) => [p.ticker, p.close.toNumber()]));

  let totalValue = 0;
  const rows: HistoryPositionRow[] = [];

  for (const position of allPositions) {
    const txs = position.transactions
      .filter((t) => t.date <= cutoff)
      .map((t) => ({ type: t.type, quantity: t.quantity, price: t.price, fees: t.fees, date: t.date }));
    if (txs.length === 0) continue;

    const qty = currentQuantity(txs);
    if (qty <= 0) continue;

    const history = histories[position.asset.ticker];
    const price = cachedByTicker.get(position.asset.ticker) ?? (history && nearestDailyPrice(history, day)) ?? averageCostPrice(txs);
    const prevPrice = (history && previousTradingDayPrice(history, day)) ?? price;

    const value = qty * price;
    const dayChangeAbs = qty * (price - prevPrice);
    const dayChangePct = prevPrice > 0 ? (price / prevPrice - 1) * 100 : 0;

    totalValue += value;

    rows.push({
      ticker: position.asset.ticker,
      name: position.asset.name,
      sector: position.asset.sector ?? "Autre",
      cls: ASSET_TYPE_LABEL[position.asset.assetType] ?? position.asset.assetType,
      qty,
      price,
      value,
      dayChangeAbs,
      dayChangePct,
      weight: 0, // calculé ci-dessous une fois `totalValue` connu
    });
  }

  for (const row of rows) {
    row.weight = totalValue > 0 ? (row.value / totalValue) * 100 : 0;
  }
  rows.sort((a, b) => b.value - a.value);

  return { date: day, requestedDate, totalValue, rows, minDate, maxDate };
}

export interface PortfolioValuePoint {
  date: string;
  totalValue: number;
  dayChangeAbs: number;
  dayChangePct: number;
}

export interface PortfolioValueSeriesResult {
  points: PortfolioValuePoint[];
  minDate: string | null;
  maxDate: string;
}

/**
 * Comme `getPositionsHistoryForDate`, mais pour une plage de jours plutôt
 * qu'un seul — un point par jour calendaire (valeur totale des positions,
 * cash exclu, comme `totalValue` ci-dessus). Les historiques de cours sont
 * récupérés une seule fois pour toute la plage (pas un appel réseau par
 * jour) : seule la recherche du prix le plus proche est répétée en mémoire,
 * ce qui reste rapide même sur un an. Un jour sans transaction antérieure ou
 * sans position ouverte vaut simplement 0.
 */
export async function getPortfolioValueSeries(userId: string, fromDate: string, toDate: string): Promise<PortfolioValueSeriesResult> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    include: { positions: { include: { asset: true, transactions: true } } },
  });
  const allPositions = accounts.flatMap((a) => a.positions);

  const allTxDates = allPositions.flatMap((p) => p.transactions.map((t) => t.date));
  const minDate = allTxDates.length > 0 ? allTxDates.reduce((min, d) => (d < min ? d : min)).toISOString().slice(0, 10) : null;
  const maxDate = new Date().toISOString().slice(0, 10);

  const from = fromDate < maxDate ? fromDate : maxDate;
  const to = toDate < maxDate ? toDate : maxDate;

  const tickers = [...new Set(allPositions.map((p) => p.asset.ticker))];
  const histories = tickers.length > 0 ? await getYahooDailyHistories(tickers) : {};

  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const points: PortfolioValuePoint[] = [];
  let prevValue: number | null = null;

  for (const day of days) {
    const cutoff = new Date(`${day}T23:59:59.999Z`);
    let totalValue = 0;

    for (const position of allPositions) {
      const txs = position.transactions
        .filter((t) => t.date <= cutoff)
        .map((t) => ({ type: t.type, quantity: t.quantity, price: t.price, fees: t.fees, date: t.date }));
      if (txs.length === 0) continue;

      const qty = currentQuantity(txs);
      if (qty <= 0) continue;

      const history = histories[position.asset.ticker];
      const price = (history && nearestDailyPrice(history, day)) ?? averageCostPrice(txs);
      totalValue += qty * price;
    }

    const dayChangeAbs = prevValue !== null ? totalValue - prevValue : 0;
    const dayChangePct = prevValue && prevValue > 0 ? (totalValue / prevValue - 1) * 100 : 0;
    points.push({ date: day, totalValue, dayChangeAbs, dayChangePct });
    prevValue = totalValue;
  }

  return { points, minDate, maxDate };
}
