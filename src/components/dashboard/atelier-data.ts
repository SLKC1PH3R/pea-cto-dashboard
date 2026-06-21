// ============================================================
// atelier-data.ts
// Types, helpers de formatage et géométrie des graphiques pour le
// dashboard "Atelier". Aucune donnée de démonstration : tous les champs
// sont alimentés par de vraies données (Prisma / Finnhub) — voir
// src/lib/dashboard-data.ts. Les métriques qu'on ne peut pas calculer
// honnêtement (performance mensuelle/YTD/annuelle, indices de marché,
// objectifs multiples) ont été volontairement omises plutôt que
// fabriquées.
// ============================================================

export type Period = "1M" | "3M" | "6M" | "1A" | "Max";

export interface AllocSlice {
  label: string;
  pct: number;
  color: string;
}

export interface Position {
  name: string;
  ticker: string;
  cls: string; // classe d'actif (Actions / ETF…)
  sector: string; // secteur GICS approximatif
  qty: number;
  pru: number;
  price: number;
  day: number; // variation jour en %
  priceSource: "live" | "manual" | "pru"; // origine du cours : Finnhub, saisie manuelle, ou repli sur le PRU
}

export interface Mover {
  name: string;
  ticker?: string;
  pct: number;
}

export interface Transaction {
  label: string;
  sub: string;
  amount: number;
  date: string;
  type: "buy" | "sell" | "div" | "in" | "fee";
}

export interface Sector {
  label: string;
  pct: number;
  color: string;
}

export interface WatchItem {
  name: string;
  ticker: string;
  cls: string;
  price: number;
  day: number;
}

// ── Plafond réglementaire PEA (valeur fixe légale, pas une donnée fabriquée :
// 150 000 € pour un PEA classique en France). Le CTO n'a pas de plafond.
export const PEA_CAP = 150_000;

export interface AccountSummary {
  id: string;
  name: string;
  type: "PEA" | "CTO";
  plafond: number | null;
  deposited: number; // capital versé net (dépôts - retraits) sur ce compte
  cash: number; // capital disponible (non investi) sur ce compte
  marketValue: number; // valeur de marché des positions détenues
  total: number; // marketValue + cash
  unrealizedPnl: number; // +/- latente sur les positions actuellement détenues
  realizedPnl: number; // +/- réalisée sur les ventes passées (prises de bénéfice/perte)
  totalPnl: number; // unrealizedPnl + realizedPnl
}

export interface DashboardData {
  email: string;
  name: string;
  avatarColor: string | null;
  avatarUrl: string | null;
  birthDate: string | null; // ISO yyyy-mm-dd
  fireAge: number | null;
  total: number;
  invested: number;
  dayAbs: number;
  dayPct: number;
  totalPnlPct: number; // performance globale depuis le début (réel, pas de période glissante)
  fees: { annual: number; rate: number; items: { label: string; amount: number }[] };
  cash: number;
  goal: number | null;
  evo: number[]; // capital versé cumulé, par mois (plus ancien → plus récent)
  alloc: AllocSlice[];
  positions: Position[];
  gainers: Mover[];
  losers: Mover[];
  tx: Transaction[];
  dateLabel: string;
  // ── Portefeuille
  sectors: Sector[];
  accounts: AccountSummary[];
  // ── Marchés (basé sur la watchlist réelle de l'utilisateur, pas sur des indices fabriqués)
  watchlist: WatchItem[];
}

// ── Formatage ────────────────────────────────────────────────
export const nf = (n: number, d = 0) =>
  Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const eur = (n: number, d = 0) => `${nf(n, d)} €`;
export const signPct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${nf(Math.abs(n), 2)} %`;
export const signEur = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${nf(Math.abs(n))} €`;

// ── Géométrie : courbe lissée (Catmull-Rom -> Bézier) ──────────
type Pt = [number, number];

function smooth(pts: Pt[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || pts[i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

const PERIOD_POINTS: Record<Period, number> = { "1M": 4, "3M": 7, "6M": 10, "1A": 14, Max: 9999 };
const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];

export interface EvolutionPoint {
  xPct: number;
  yPct: number;
  value: number; // capital versé cumulé réel à ce point, en €
  pctFromStart: number; // progression vs le premier point de la série affichée
  dateLabel: string; // ex: "avril 2026"
}

export interface EvolutionChart {
  line: string;
  area: string;
  lastTopPct: number;
  labels: { leftPct: number; text: string }[];
  endValue: number;
  points: EvolutionPoint[];
}

export function buildEvolution(evo: number[], period: Period, now: Date = new Date()): EvolutionChart {
  const n = Math.min(PERIOD_POINTS[period], evo.length);
  const series = evo.slice(evo.length - n);
  const W = 1000;
  const H = 300;
  const padY = 20;
  const mn = Math.min(...series);
  const mx = Math.max(...series);
  const rg = mx - mn || 1;
  const L = series.length;
  const pts: Pt[] = series.map((v, i) => [
    (L === 1 ? 0 : i / (L - 1)) * W,
    padY + (H - padY * 2) * (1 - (v - mn) / rg),
  ]);
  const line = smooth(pts);
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const last = pts[pts.length - 1];
  const labCount = Math.min(6, L);
  const labels = Array.from({ length: labCount }, (_, k) => {
    const i = Math.round((k * (L - 1)) / (labCount - 1));
    const mi = (((5 - (L - 1 - i)) % 12) + 12) % 12;
    return { leftPct: +((i / (L - 1)) * 100).toFixed(1), text: MONTHS[mi] };
  });
  const start = series[0] || 0;
  const points: EvolutionPoint[] = series.map((v, i) => {
    const pointDate = new Date(now.getFullYear(), now.getMonth() - (L - 1 - i), 1);
    return {
      xPct: +((L === 1 ? 0 : (i / (L - 1)) * 100)).toFixed(2),
      yPct: +((pts[i][1] / H) * 100).toFixed(2),
      value: v,
      pctFromStart: start > 0 ? +(((v - start) / start) * 100).toFixed(2) : 0,
      dateLabel: pointDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    };
  });
  return { line, area, lastTopPct: +((last[1] / H) * 100).toFixed(2), labels, endValue: series[series.length - 1] * 1000, points };
}

// ── Géométrie : donut allocation ───────────────────────────────
export interface DonutSegment {
  label: string;
  color: string;
  pctFmt: string;
  dash: string;
  offset: number;
}

export function buildDonut(alloc: AllocSlice[], r = 70, gap = 4): DonutSegment[] {
  const C = 2 * Math.PI * r;
  let cum = 0;
  return alloc.map((s) => {
    const len = (s.pct / 100) * C;
    const seg: DonutSegment = {
      label: s.label,
      color: s.color,
      pctFmt: `${s.pct} %`,
      dash: `${(len - gap).toFixed(2)} ${(C - len + gap).toFixed(2)}`,
      offset: +(-cum).toFixed(2),
    };
    cum += len;
    return seg;
  });
}

// ── Géométrie : anneau d'objectif ──────────────────────────────
export function buildRing(pct: number, r = 52): string {
  const C = 2 * Math.PI * r;
  const filled = (Math.min(pct, 100) / 100) * C;
  return `${filled.toFixed(2)} ${(C - filled).toFixed(2)}`;
}

// ── Projection patrimoniale (capitalisation composée + versements) ──
// Simulation explicite à partir d'hypothèses choisies par l'utilisateur
// (taux, versement mensuel) — pas une donnée historique fabriquée.
export interface ProjectionChart {
  line: string;
  area: string;
  endValue: number;
  goalLineY: number | null;
  goalLabelTopPct: number | null;
  labels: { leftPct: number; text: string }[];
}

export function buildProjection(
  start: number,
  goal: number | null,
  ratePct: number,
  monthly: number,
  years = 10,
  startYear = new Date().getFullYear()
): ProjectionChart {
  const r = ratePct / 100;
  const proj: number[] = [];
  let bal = start;
  for (let y = 0; y <= years; y++) {
    proj.push(bal);
    bal = bal * (1 + r) + monthly * 12;
  }
  const W = 1000;
  const H = 300;
  const pad = 16;
  const mn = Math.min(...proj);
  const mx = Math.max(goal ?? 0, ...proj);
  const rg = mx - mn || 1;
  const pts: Pt[] = proj.map((v, i) => [(i / (proj.length - 1)) * W, pad + (H - pad * 2) * (1 - (v - mn) / rg)]);
  const line = smooth(pts);
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const goalLineY = goal ? pad + (H - pad * 2) * (1 - (goal - mn) / rg) : null;
  const labels = Array.from({ length: 6 }, (_, k) => {
    const yr = Math.round((k * years) / 5);
    return { leftPct: +((yr / years) * 100).toFixed(1), text: String(startYear + yr) };
  });
  return {
    line,
    area,
    endValue: proj[proj.length - 1],
    goalLineY: goalLineY !== null ? +goalLineY.toFixed(1) : null,
    goalLabelTopPct: goalLineY !== null ? +((goalLineY / H) * 100).toFixed(1) : null,
    labels,
  };
}

// ── Temps estimé pour atteindre un objectif (capitalisation composée
// mensuelle + versement mensuel constant) ──────────────────────────
export interface TimeToGoal {
  years: number;
  months: number;
}

export function yearsToReachGoal(
  start: number,
  goal: number,
  ratePct: number,
  monthly: number,
  maxYears = 60
): TimeToGoal | null {
  if (goal <= start) return { years: 0, months: 0 };
  const rMonthly = ratePct / 100 / 12;
  let bal = start;
  const maxMonths = maxYears * 12;
  for (let m = 1; m <= maxMonths; m++) {
    bal = bal * (1 + rMonthly) + monthly;
    if (bal >= goal) {
      return { years: Math.floor(m / 12), months: m % 12 };
    }
  }
  return null; // pas atteint dans l'horizon maximal (taux/versement trop faibles)
}

// ── Versement mensuel requis pour atteindre un objectif dans N années
// (calculatrice FIRE : âge actuel -> âge cible) ─────────────────────
export function requiredMonthlyContribution(start: number, goal: number, ratePct: number, years: number): number {
  if (years <= 0) return goal > start ? Infinity : 0;
  const n = years * 12;
  const rMonthly = ratePct / 100 / 12;
  const futureStart = start * Math.pow(1 + rMonthly, n);
  const remaining = goal - futureStart;
  if (remaining <= 0) return 0; // déjà en bonne voie sans rien ajouter
  if (rMonthly === 0) return remaining / n;
  const annuityFactor = (Math.pow(1 + rMonthly, n) - 1) / rMonthly;
  return remaining / annuityFactor;
}

// ── Rentabilités historiques annualisées à titre indicatif (long terme,
// dividendes/réinvestissement inclus le cas échéant). Moyennes connues et
// largement publiées — PAS une prédiction, le passé ne garantit pas le
// futur, et la volatilité réelle (surtout Bitcoin) peut être extrême.
// ────────────────────────────────────────────────────────────────────
export interface HistoricalBenchmark {
  label: string;
  ratePct: number;
  note: string;
}

export const HISTORICAL_BENCHMARKS: HistoricalBenchmark[] = [
  { label: "Livret A / fonds €", ratePct: 2.5, note: "sans risque, référence basse" },
  { label: "Or (XAU)", ratePct: 7, note: "très long terme" },
  { label: "MSCI World", ratePct: 8, note: "actions monde diversifiées" },
  { label: "S&P 500", ratePct: 10, note: "moyenne ~1957–2024, dividendes réinvestis" },
  { label: "Nasdaq 100", ratePct: 13, note: "moyenne depuis 1985, plus volatil" },
  { label: "Bitcoin", ratePct: 30, note: "extrêmement volatil, chiffre très incertain" },
];

// ── Palette "Atelier" (violet feutré) — variables CSS par thème ─
export type Theme = "light" | "dark";

export const PALETTE: Record<Theme, Record<string, string>> = {
  dark: {
    "--bg": "#0e0c16",
    "--bg2": "#141022",
    "--panel": "#1a1628",
    "--panel2": "#221c34",
    "--fg": "#f0edf8",
    "--fg2": "#a79fbd",
    "--fg3": "#6e6685",
    "--line": "rgba(255,255,255,.07)",
    "--accent": "#9d7bf5",
    "--accent2": "#c9b6fb",
    "--pos": "#5fc7a0",
    "--neg": "#e08a8a",
    "--posbg": "rgba(95,199,160,.14)",
    "--negbg": "rgba(224,138,138,.14)",
    "--shadow": "0 2px 8px rgba(0,0,0,.3), 0 20px 50px -28px rgba(120,80,240,.45)",
    "--track": "#251f38",
  },
  light: {
    "--bg": "#f5f3fb",
    "--bg2": "#efeafa",
    "--panel": "#ffffff",
    "--panel2": "#faf8ff",
    "--fg": "#1c172b",
    "--fg2": "#6c6483",
    "--fg3": "#9b94ad",
    "--line": "#ece7f6",
    "--accent": "#7c5cdb",
    "--accent2": "#9b7fe6",
    "--pos": "#2f9d76",
    "--neg": "#d06464",
    "--posbg": "rgba(47,157,118,.10)",
    "--negbg": "rgba(208,100,100,.10)",
    "--shadow": "0 1px 2px rgba(40,20,80,.05), 0 18px 44px -22px rgba(120,80,240,.28)",
    "--track": "#ece7f6",
  },
};
