// ============================================================
// atelier-data.ts
// Types, données et helpers (formatage + géométrie des graphiques) pour le
// dashboard "Atelier". Aucune dépendance — pur TypeScript.
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
  cls: string;
  qty: number;
  pru: number;
  price: number;
  day: number; // variation jour en %
  ytd: number; // variation YTD en %
}

export interface Mover {
  name: string;
  pct: number;
}

export interface Transaction {
  label: string;
  sub: string;
  amount: number;
  date: string;
  type: "buy" | "sell" | "div" | "in" | "fee";
}

export interface DashboardData {
  email: string;
  name: string;
  total: number;
  invested: number;
  dayAbs: number;
  dayPct: number;
  monthPct: number;
  ytdPct: number;
  yearPct: number;
  threeYearPct: number;
  fees: { annual: number; rate: number; items: { label: string; amount: number }[] };
  cash: number;
  goal: number;
  evo: number[]; // valeurs mensuelles en k€ (plus ancien → plus récent)
  alloc: AllocSlice[];
  positions: Position[];
  gainers: Mover[];
  losers: Mover[];
  tx: Transaction[];
  dateLabel: string;
}

// ── Données de démonstration ────────────────────────────────
// TODO : remplacer par vos vraies requêtes (Prisma / API). La forme ci-dessous
// est tout ce dont le composant a besoin.
export function buildDashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    email: "camille.laurent@aurum-patrimoine.fr",
    name: "Camille",
    total: 1248320,
    invested: 1043500,
    dayAbs: 10412,
    dayPct: 0.84,
    monthPct: 3.21,
    ytdPct: 12.74,
    yearPct: 18.24,
    threeYearPct: 34.6,
    fees: {
      annual: 4280,
      rate: 0.34,
      items: [
        { label: "Frais de gestion", amount: 2980 },
        { label: "Courtage", amount: 860 },
        { label: "Droits de garde", amount: 440 },
      ],
    },
    cash: 86500,
    goal: 1500000,
    evo: [962, 988, 1002, 985, 1024, 1058, 1039, 1086, 1112, 1097, 1141, 1129, 1168, 1156, 1197, 1212, 1235, 1248],
    alloc: [
      { label: "Actions", pct: 42, color: "#a78bfa" },
      { label: "ETF", pct: 17, color: "#c9b6fb" },
      { label: "Obligations", pct: 16, color: "#6ea8c9" },
      { label: "Immobilier", pct: 11, color: "#c9a978" },
      { label: "Crypto", pct: 8, color: "#5fb89a" },
      { label: "Liquidités", pct: 6, color: "#8f8799" },
    ],
    positions: [
      { name: "LVMH", ticker: "MC.PA", cls: "Actions", qty: 120, pru: 560.0, price: 642.3, day: 1.24, ytd: 8.4 },
      { name: "ASML Holding", ticker: "ASML", cls: "Actions", qty: 60, pru: 712.5, price: 890.1, day: 2.08, ytd: 21.3 },
      { name: "TotalEnergies", ticker: "TTE.PA", cls: "Actions", qty: 800, pru: 58.4, price: 61.2, day: -0.42, ytd: 5.12 },
      { name: "Apple", ticker: "AAPL", cls: "Actions", qty: 300, pru: 182.3, price: 214.5, day: 0.64, ytd: 14.2 },
      { name: "iShares MSCI World", ticker: "IWDA", cls: "ETF", qty: 950, pru: 84.6, price: 102.8, day: 0.51, ytd: 16.8 },
      { name: "OAT France 2031", ticker: "FR0014", cls: "Obligations", qty: 1200, pru: 99.2, price: 101.1, day: 0.08, ytd: 2.31 },
      { name: "Bitcoin", ticker: "BTC", cls: "Crypto", qty: 1.4, pru: 41200, price: 58200, day: 3.42, ytd: 41.2 },
      { name: "SCPI Primovie", ticker: "SCPI", cls: "Immobilier", qty: 480, pru: 196.0, price: 200.0, day: 0.0, ytd: 3.9 },
    ],
    gainers: [
      { name: "Bitcoin", pct: 3.42 },
      { name: "ASML Holding", pct: 2.08 },
      { name: "LVMH", pct: 1.24 },
    ],
    losers: [
      { name: "Renault", pct: -1.12 },
      { name: "Orange", pct: -0.63 },
      { name: "TotalEnergies", pct: -0.42 },
    ],
    tx: [
      { label: "Achat — ASML Holding", sub: "10 titres · 890,10 €", amount: -8901, date: "17 juin", type: "buy" },
      { label: "Dividende — TotalEnergies", sub: "Coupon trimestriel", amount: 740, date: "15 juin", type: "div" },
      { label: "Vente — Apple", sub: "50 titres · 214,50 €", amount: 10725, date: "12 juin", type: "sell" },
      { label: "Versement programmé", sub: "Virement SEPA", amount: 5000, date: "01 juin", type: "in" },
      { label: "Frais de gestion", sub: "Prélèvement mensuel", amount: -248, date: "01 juin", type: "fee" },
    ],
    dateLabel: "18 juin 2026",
    ...overrides,
  };
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

export interface EvolutionChart {
  line: string;
  area: string;
  lastTopPct: number;
  labels: { leftPct: number; text: string }[];
  endValue: number;
}

export function buildEvolution(evo: number[], period: Period): EvolutionChart {
  const n = Math.min(PERIOD_POINTS[period], evo.length);
  const series = evo.slice(evo.length - n);
  const W = 1000;
  const H = 300;
  const padY = 20;
  const mn = Math.min(...series);
  const mx = Math.max(...series);
  const rg = mx - mn || 1;
  const pts: Pt[] = series.map((v, i) => [
    (series.length === 1 ? 0 : i / (series.length - 1)) * W,
    padY + (H - padY * 2) * (1 - (v - mn) / rg),
  ]);
  const line = smooth(pts);
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const last = pts[pts.length - 1];
  const L = series.length;
  const labCount = Math.min(6, L);
  const labels = Array.from({ length: labCount }, (_, k) => {
    const i = Math.round((k * (L - 1)) / (labCount - 1));
    const mi = (((5 - (L - 1 - i)) % 12) + 12) % 12;
    return { leftPct: +((i / (L - 1)) * 100).toFixed(1), text: MONTHS[mi] };
  });
  return { line, area, lastTopPct: +((last[1] / H) * 100).toFixed(2), labels, endValue: series[series.length - 1] * 1000 };
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
