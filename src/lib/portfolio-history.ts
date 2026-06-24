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
    const price = (history && nearestDailyPrice(history, day)) ?? averageCostPrice(txs);
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
