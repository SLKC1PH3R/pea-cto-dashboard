import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getQuotes } from "@/lib/finnhub";
import { currentQuantity, averageCostPrice, totalAcquisitionCost } from "@/lib/finance-calculations";
import { AtelierDashboard } from "@/components/dashboard/AtelierDashboard";
import type {
  DashboardData,
  Position as AtelierPosition,
  AllocSlice,
  Mover,
  Transaction as AtelierTx,
} from "@/components/dashboard/atelier-data";

export const dynamic = "force-dynamic";

const ASSET_TYPE_LABEL: Record<string, string> = {
  ACTION: "Actions",
  ETF_DISTRIBUANT: "ETF",
  ETF_CAPITALISANT: "ETF",
};

const ALLOC_COLORS = ["#a78bfa", "#c9b6fb", "#6ea8c9", "#c9a978", "#5fb89a"];

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

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (!session.user.onboarded) {
    redirect("/onboarding");
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });

  const accounts = await prisma.account.findMany({
    where: { userId: session.user.id },
    include: {
      deposits: true,
      fees: true,
      positions: { include: { asset: true, transactions: true, dividends: true } },
    },
  });

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

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

    atelierPositions.push({
      name: position.asset.name,
      ticker: position.asset.ticker,
      cls: clsLabel,
      qty,
      pru,
      price: currentPrice,
      day: dayPct,
    });
  }

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

  const data: DashboardData = {
    email: session.user.email ?? "",
    name: user?.name ?? session.user.email?.split("@")[0] ?? "",
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
  };

  return <AtelierDashboard data={data} signOutAction={handleSignOut} />;
}
