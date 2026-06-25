"use client";

// ============================================================
// AtelierDashboard.tsx
// Dashboard patrimonial — direction "Atelier" (bento, dégradé, cartes douces).
// 4 onglets : Synthèse · Portefeuille · Marchés · Objectifs.
// Interactif : toggle clair/sombre, tri des positions, sélection de période.
// Toutes les données viennent de src/lib/dashboard-data.ts (réelles) — aucune
// métrique fabriquée (pas de performance YTD/mensuelle/annuelle, pas
// d'indices de marché : on n'a pas l'historique pour les calculer honnêtement).
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type DashboardData,
  type Period,
  type Theme,
  PALETTE,
  buildEvolution,
  buildDonut,
  buildRing,
  buildProjection,
  yearsToReachGoal,
  requiredMonthlyContribution,
  HISTORICAL_BENCHMARKS,
  nf,
  eur,
  signPct,
  signEur,
} from "./atelier-data";
import { MarketsBrowser } from "@/components/markets/MarketsBrowser";
import { GoalForm } from "@/components/objectifs/GoalForm";
import { ProfileSettings } from "@/components/profile/ProfileSettings";
import { InstallFolioButton } from "@/components/pwa/InstallFolioButton";
import { HistoryView } from "@/components/dashboard/HistoryView";
import { AccountManager } from "@/components/import/AccountManager";
import { ImportDropzone } from "@/components/import/ImportDropzone";
import { TRCsvImport } from "@/components/import/TRCsvImport";
import { PerformanceCsvImport } from "@/components/import/PerformanceCsvImport";
import { ManualTransactionForm } from "@/components/import/ManualTransactionForm";
import { DcaRuleForm } from "@/components/import/DcaRuleForm";
import { DcaRulesManager } from "@/components/import/DcaRulesManager";
import { TransactionsManager } from "@/components/import/TransactionsManager";

type SortKey = "name" | "value" | "day" | "totalPct" | "weight";
type Page = "synthese" | "portefeuille" | "historique" | "marches" | "objectifs" | "import";

type AccountRow = { id: string; name: string; type: string; broker: string | null };

const PERIODS: Period[] = ["1M", "3M", "6M", "1A", "Max"];
const PAGES: { key: Page; label: string }[] = [
  { key: "synthese", label: "Synthèse" },
  { key: "portefeuille", label: "Portefeuille" },
  { key: "historique", label: "Historique" },
  { key: "marches", label: "Marchés" },
  { key: "objectifs", label: "Objectifs" },
  { key: "import", label: "Importer" },
];

const num = { fontFamily: "var(--font-num, 'Space Grotesk', system-ui)" } as const;

// Badges pour l'origine d'un cours quand ce n'est pas une cotation Finnhub
// temps réel — "OK" = source de marché alternative fiable (juste pas
// couverte par Finnhub gratuit), le reste = à interpréter avec prudence.
type PriceSourceKey = "live" | "yahoo" | "tradingview" | "boursorama" | "manual" | "pru" | "none";
const PRICE_SOURCE_OK = new Set<PriceSourceKey>(["yahoo", "tradingview", "boursorama"]);
const PRICE_SOURCE_LABEL: Record<PriceSourceKey, string> = {
  live: "",
  yahoo: "Yahoo",
  tradingview: "TV",
  boursorama: "bourso",
  manual: "manuel",
  pru: "PRU",
  none: "",
};
const PRICE_SOURCE_TITLE: Record<PriceSourceKey, string> = {
  live: "",
  yahoo: "Cours récupéré depuis Yahoo Finance (Finnhub ne couvre pas cette place)",
  tradingview: "Cours récupéré depuis tradingview.com (Finnhub ne couvre pas cette place)",
  boursorama: "Cours récupéré depuis boursorama.com (Finnhub ne couvre pas cette place)",
  manual: "Cours saisi manuellement",
  pru: "Cours indisponible — repli sur le PRU",
  none: "",
};

export function AtelierDashboard({
  data,
  accounts,
  signOutAction,
}: {
  data: DashboardData;
  accounts: AccountRow[];
  signOutAction?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPage = (searchParams.get("tab") as Page | null) ?? "synthese";

  const [theme, setTheme] = useState<Theme>("dark");
  const [page, setPage] = useState<Page>(PAGES.some((p) => p.key === initialPage) ? initialPage : "synthese");
  const [period, setPeriod] = useState<Period>("1A");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [projRate, setProjRate] = useState(5);
  const [projMonthly, setProjMonthly] = useState(0);
  const [birthDate, setBirthDate] = useState(data.birthDate ?? "");
  const [fireAge, setFireAge] = useState(data.fireAge ?? 50);
  const [fireRate, setFireRate] = useState(7);
  const [fireSaving, setFireSaving] = useState(false);
  const [watchlist, setWatchlist] = useState(data.watchlist);
  const [editingPriceTicker, setEditingPriceTicker] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  async function saveManualPrice(ticker: string) {
    const price = parseFloat(priceInput);
    if (!Number.isFinite(price) || price <= 0) return;
    setSavingPrice(true);
    await fetch("/api/assets/manual-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, price }),
    });
    setSavingPrice(false);
    setEditingPriceTicker(null);
    router.refresh();
  }

  const [editingWatchTicker, setEditingWatchTicker] = useState<string | null>(null);
  const [watchPriceInput, setWatchPriceInput] = useState("");
  const [savingWatchPrice, setSavingWatchPrice] = useState(false);

  async function saveWatchManualPrice(ticker: string) {
    const price = parseFloat(watchPriceInput);
    if (!Number.isFinite(price) || price <= 0) return;
    setSavingWatchPrice(true);
    await fetch("/api/watchlist/manual-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, price }),
    });
    setSavingWatchPrice(false);
    setEditingWatchTicker(null);
    router.refresh();
  }

  const isEmpty = data.positions.length === 0 && data.cash <= 0;

  function addWatchlistItem(item: (typeof watchlist)[number]) {
    setWatchlist((prev) => [...prev.filter((w) => w.ticker !== item.ticker), item]);
  }

  function removeWatchlistItem(ticker: string) {
    setWatchlist((prev) => prev.filter((w) => w.ticker !== ticker));
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    setBannerDismissed(window.localStorage.getItem("folio_empty_banner_dismissed") === "1");
  }, []);

  function dismissBanner() {
    setBannerDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("folio_empty_banner_dismissed", "1");
    }
  }

  // ── Positions enrichies (valeur, +/- latente, performance totale réelle, poids) + tri ──
  const positions = useMemo(() => {
    let sum = 0;
    const enriched = data.positions.map((p) => {
      const value = p.qty * p.price;
      const pl = (p.price - p.pru) * p.qty;
      const totalPct = p.pru > 0 ? (p.price / p.pru - 1) * 100 : 0;
      sum += value;
      return { ...p, value, pl, totalPct };
    });
    const withWeight = enriched.map((p) => ({ ...p, weight: sum > 0 ? (p.value / sum) * 100 : 0 }));
    const maxW = Math.max(...withWeight.map((p) => p.weight), 0.01);
    const sorted = [...withWeight].sort((a, b) => {
      if (sortKey === "name") return sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return { rows: sorted, sum, maxW };
  }, [data.positions, sortKey, sortDir]);

  const chart = useMemo(() => buildEvolution(data.evo, data.evoTotal, period), [data.evo, data.evoTotal, period]);
  const donut = useMemo(() => buildDonut(data.alloc), [data.alloc]);
  const sectorDonut = useMemo(() => buildDonut(data.sectors), [data.sectors]);
  const goalPct = data.goal ? (data.total / data.goal) * 100 : 0;
  const ringDash = useMemo(() => buildRing(goalPct), [goalPct]);
  const pl = data.total - data.invested;

  const perfBars = useMemo(() => {
    const raw = [
      { label: "Aujourd'hui", pct: data.dayPct },
      { label: "Total", pct: data.totalPnlPct * 100 },
    ];
    const maxAbs = Math.max(...raw.map((r) => Math.abs(r.pct)), 0.01);
    return raw.map((r) => ({ ...r, width: (Math.abs(r.pct) / maxAbs) * 100, pos: r.pct >= 0 }));
  }, [data]);

  const sectors = useMemo(() => {
    const max = Math.max(...data.sectors.map((s) => s.pct), 1);
    return data.sectors.map((s) => ({ ...s, barPct: (s.pct / max) * 100 }));
  }, [data.sectors]);

  const geo = useMemo(() => {
    const max = Math.max(...data.geo.map((s) => s.pct), 1);
    return data.geo.map((s) => ({ ...s, barPct: (s.pct / max) * 100 }));
  }, [data.geo]);

  const currencies = useMemo(() => {
    const max = Math.max(...data.currencies.map((s) => s.pct), 1);
    return data.currencies.map((s) => ({ ...s, barPct: (s.pct / max) * 100 }));
  }, [data.currencies]);

  // ── Temps estimé pour atteindre l'objectif, recalculé dès que le total
  // réel (donc le PnL), le rythme de versement ou le taux changent ──────
  const timeToGoal = useMemo(
    () => (data.goal ? yearsToReachGoal(data.total, data.goal, projRate, projMonthly) : null),
    [data.total, data.goal, projRate, projMonthly]
  );
  const projectionYears = Math.min(Math.max(timeToGoal ? timeToGoal.years + 1 : 10, 1), 60);

  const projection = useMemo(
    () => buildProjection(data.total, data.goal, projRate, projMonthly, projectionYears),
    [data.total, data.goal, projRate, projMonthly, projectionYears]
  );

  // ── Calculatrice FIRE : âge actuel (date de naissance) -> âge cible,
  // versement mensuel requis pour atteindre l'objectif à temps ──────────
  const currentAge = useMemo(() => {
    if (!birthDate) return null;
    const diffMs = Date.now() - new Date(birthDate).getTime();
    return Math.floor(diffMs / (365.25 * 86_400_000));
  }, [birthDate]);

  const yearsToFire = currentAge !== null ? fireAge - currentAge : null;

  const requiredMonthly = useMemo(() => {
    if (!data.goal || yearsToFire === null) return null;
    return requiredMonthlyContribution(data.total, data.goal, fireRate, yearsToFire);
  }, [data.total, data.goal, fireRate, yearsToFire]);

  async function saveFireProfile(nextBirthDate: string, nextFireAge: number) {
    setFireSaving(true);
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthDate: nextBirthDate || null, fireAge: nextFireAge }),
    });
    setFireSaving(false);
  }

  // ── Mouvements (positions + watchlist réelles, pas de marché générique) ──
  const movers = useMemo(() => {
    const all = [
      ...data.positions.map((p) => ({ name: p.name, ticker: p.ticker, pct: p.day })),
      ...watchlist.filter((w) => w.day !== null).map((w) => ({ name: w.name, ticker: w.ticker, pct: w.day as number })),
    ];
    const sorted = [...all].sort((a, b) => b.pct - a.pct);
    return { up: sorted.slice(0, 3), down: sorted.slice(-3).reverse() };
  }, [data.positions, watchlist]);

  const allocColor = (cls: string) => data.alloc.find((a) => a.label === cls)?.color ?? "var(--fg3)";
  const sectorColor = (label: string) => data.sectors.find((s) => s.label === label)?.color ?? "var(--fg3)";

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }
  const caret = (key: SortKey) => (sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "");

  return (
    <main
      style={{ ...PALETTE[theme], background: "var(--bg)", color: "var(--fg)", fontFamily: "var(--font-body, 'Plus Jakarta Sans', system-ui)" }}
      className="min-h-screen"
    >
      <div className="min-w-[1180px] px-[26px] pb-8 pt-[22px]">
        {/* Topbar */}
        <header className="mb-[22px] flex items-center justify-between gap-6">
          <div className="flex items-center gap-7">
            <div className="flex items-center gap-[11px]">
              <Image src="/folio-logo.svg" alt="Folio" width={36} height={36} className="rounded-xl" />
              <span className="text-[19px] font-extrabold tracking-tight text-[var(--fg)]">Folio</span>
            </div>
            <nav className="flex gap-1 rounded-2xl border border-[var(--line)] bg-[var(--panel2)] p-[5px]">
              {PAGES.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPage(p.key)}
                  className="rounded-[10px] px-[15px] py-[7px] text-[13px] font-semibold"
                  style={{ background: page === p.key ? "var(--accent)" : "transparent", color: page === p.key ? "#fff" : "var(--fg2)" }}
                >
                  {p.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-[14px]">
            <div className="flex rounded-xl border border-[var(--line)] bg-[var(--panel)] p-[3px]">
              {(["light", "dark"] as Theme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className="rounded-lg px-3 py-[5px] text-[12px] font-semibold"
                  style={{ background: theme === t ? "var(--accent)" : "transparent", color: theme === t ? "#fff" : "var(--fg2)" }}
                >
                  {t === "light" ? "Clair" : "Sombre"}
                </button>
              ))}
            </div>
            <InstallFolioButton />
            <div className="flex items-center gap-[9px] rounded-xl border border-[var(--line)] bg-[var(--panel)] px-[14px] py-2">
              <span className="text-[12px] text-[var(--fg3)]">Valeur totale</span>
              <span style={num} className="text-[13px] font-semibold text-[var(--fg)]">{eur(data.total)}</span>
            </div>
            <div className="flex items-center gap-[9px]">
              <ProfileSettings name={data.name} email={data.email} avatarColor={data.avatarColor} avatarUrl={data.avatarUrl} />
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-[11px] border border-[var(--line)] bg-[var(--panel)] px-[13px] py-[9px] text-[12.5px] font-medium text-[var(--fg2)] hover:border-[var(--neg)] hover:text-[var(--neg)]"
                >
                  Déconnexion
                </button>
              </form>
            </div>
          </div>
        </header>

        {/* Bandeau "aucune donnée" — dismissible */}
        {isEmpty && !bannerDismissed && (
          <div
            className="mb-[18px] flex items-center justify-between gap-4 rounded-[16px] border px-5 py-4"
            style={{ borderColor: "var(--accent)", background: "var(--panel)" }}
          >
            <div>
              <p className="text-[14px] font-bold text-[var(--fg)]">Aucun compte pour l'instant</p>
              <p className="text-[12.5px] text-[var(--fg2)]">
                Ajoute un PEA ou un CTO depuis l'import pour commencer à suivre ton patrimoine.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage("import")}
                className="rounded-[11px] px-4 py-[9px] text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(140deg, var(--accent), var(--accent2))" }}
              >
                Aller à l'import
              </button>
              <button
                onClick={dismissBanner}
                aria-label="Fermer"
                className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[16px] text-[var(--fg2)] hover:bg-[var(--panel2)] hover:text-[var(--fg)]"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════ SYNTHÈSE ════════════════════════ */}
        {page === "synthese" && (
          <div className="grid grid-cols-12 items-stretch gap-[18px]">
            <section
              className="relative col-span-4 flex flex-col justify-between gap-6 overflow-hidden rounded-[22px] p-[26px]"
              style={{ background: "linear-gradient(150deg, var(--accent), var(--accent2))", boxShadow: "var(--shadow)" }}
            >
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
              <div className="relative">
                <span className="text-[13px] font-semibold text-white/80">Valeur totale</span>
                <div style={num} className="mt-2 text-[38px] font-bold leading-[1.05] tracking-tight text-white">{eur(data.total)}</div>
                <div className="mt-3 inline-flex items-center gap-[7px] rounded-[9px] bg-white/20 px-[11px] py-[5px]">
                  <span className="text-[13px] font-bold text-white">{signPct(data.dayPct)}</span>
                  <span className="text-[12px] text-white/85">{signEur(data.dayAbs)} aujourd'hui</span>
                </div>
              </div>
              <div className="relative flex gap-[26px] border-t border-white/20 pt-[18px]">
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[11.5px] text-white/75">Capital investi</span>
                  <span style={num} className="text-[17px] font-semibold text-white">{eur(data.invested)}</span>
                </div>
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[11.5px] text-white/75">Plus-value</span>
                  <span style={num} className="text-[17px] font-semibold text-white">{signEur(pl)}</span>
                </div>
              </div>
            </section>

            <section className="col-span-8 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] px-[26px] py-6" style={{ boxShadow: "var(--shadow)" }}>
              <div className="mb-[14px] flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[17px] font-bold text-[var(--fg)]">Capital versé vs capital total</h2>
                  <span className="text-[12.5px] text-[var(--fg2)]">
                    Performance totale ·{" "}
                    <span className={pl >= 0 ? "font-semibold text-[var(--pos)]" : "font-semibold text-[var(--neg)]"}>
                      {signPct(data.totalPnlPct * 100)}
                    </span>
                  </span>
                </div>
                <div className="flex gap-1 rounded-[11px] border border-[var(--line)] bg-[var(--panel2)] p-1">
                  {PERIODS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className="rounded-lg px-3 py-[6px] text-[12px] font-semibold"
                      style={{ background: period === p ? "var(--accent)" : "transparent", color: period === p ? "#fff" : "var(--fg2)" }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-3 flex items-center gap-4 text-[11.5px] text-[var(--fg2)]">
                <span className="flex items-center gap-[6px]">
                  <span className="h-[8px] w-[8px] rounded-full" style={{ background: "var(--accent)" }} />
                  Capital total (titres + cash)
                </span>
                <span className="flex items-center gap-[6px]">
                  <span className="h-[2px] w-[14px]" style={{ background: "var(--fg3)" }} />
                  Capital versé
                </span>
              </div>
              <EvolutionSvg
                id="atelierEvo"
                area={chart.area}
                lineTotal={chart.lineTotal}
                lineVerse={chart.lineVerse}
                lastTopPctTotal={chart.lastTopPctTotal}
                lastTopPctVerse={chart.lastTopPctVerse}
                points={chart.points}
              />
              <ChartLabels labels={chart.labels} />
            </section>

            <section className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] p-6" style={{ boxShadow: "var(--shadow)" }}>
              <h2 className="mb-4 text-[17px] font-bold text-[var(--fg)]">Répartition d'actifs</h2>
              <Donut donut={donut} centerTop="Lignes" centerVal={String(data.positions.length)} />
            </section>

            <section className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] p-6" style={{ boxShadow: "var(--shadow)" }}>
              <h2 className="mb-4 text-[17px] font-bold text-[var(--fg)]">Performance</h2>
              <PerfBars bars={perfBars} />
            </section>

            <section className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] p-6" style={{ boxShadow: "var(--shadow)" }}>
              <h2 className="mb-1 text-[17px] font-bold text-[var(--fg)]">Objectif</h2>
              {data.goal ? (
                <>
                  <span className="text-[12.5px] text-[var(--fg2)]">Cible {eur(data.goal)}</span>
                  <div className="mt-[14px] flex items-center gap-[18px]">
                    <Ring dash={ringDash} pct={goalPct} />
                    <div className="flex flex-1 flex-col gap-[11px]">
                      <div className="flex flex-col">
                        <span className="text-[11.5px] text-[var(--fg2)]">Reste à atteindre</span>
                        <span style={num} className="text-[17px] font-bold text-[var(--fg)]">{eur(Math.max(data.goal - data.total, 0))}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11.5px] text-[var(--fg2)]">Frais annuels · {nf(data.fees.rate, 2)} %</span>
                        <span style={num} className="text-[17px] font-bold text-[var(--fg)]">{eur(data.fees.annual)}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-[14px] flex flex-col gap-3">
                  <span className="text-[12.5px] text-[var(--fg2)]">Tu n'as pas encore défini d'objectif de patrimoine.</span>
                  <Link
                    href="/dashboard?tab=objectifs"
                    onClick={() => setPage("objectifs")}
                    className="inline-block self-start rounded-[11px] px-4 py-[9px] text-[13px] font-semibold text-white"
                    style={{ background: "linear-gradient(140deg, var(--accent), var(--accent2))" }}
                  >
                    Définir un objectif
                  </Link>
                </div>
              )}
            </section>

            <PositionsTable positions={positions} sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} caret={caret} allocColor={allocColor} />

            <section className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] px-6 py-[22px]" style={{ boxShadow: "var(--shadow)" }}>
              <h2 className="mb-[14px] text-[17px] font-bold text-[var(--fg)]">Top mouvements</h2>
              <MoversList title="Hausses" tone="pos" items={movers.up} />
              <div className="h-3" />
              <MoversList title="Baisses" tone="neg" items={movers.down} />
            </section>

            <section className="col-span-12 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] px-[26px] py-[22px]" style={{ boxShadow: "var(--shadow)" }}>
              <h2 className="mb-[14px] text-[17px] font-bold text-[var(--fg)]">Flux &amp; transactions récents</h2>
              <div className="grid grid-cols-5 gap-[14px]">
                {data.tx.map((t, i) => {
                  const dot = t.amount >= 0 ? "var(--pos)" : t.type === "fee" ? "var(--neg)" : "var(--fg3)";
                  return (
                    <div key={i} className="flex flex-col gap-[9px] rounded-[16px] border border-[var(--line)] bg-[var(--panel2)] p-4">
                      <div className="flex items-center justify-between">
                        <span className="h-[9px] w-[9px] rounded-full" style={{ background: dot }} />
                        <span className="text-[11px] text-[var(--fg3)]">{t.date}</span>
                      </div>
                      <span className="text-[12.5px] font-semibold leading-[1.3] text-[var(--fg)]">{t.label}</span>
                      <span className="text-[11px] text-[var(--fg3)]">{t.sub}</span>
                      <span style={{ ...num, color: t.amount >= 0 ? "var(--pos)" : "var(--fg)" }} className="text-[16px] font-bold">{signEur(t.amount)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* ════════════════════════ PORTEFEUILLE ════════════════════════ */}
        {page === "portefeuille" && (
          <div className="grid grid-cols-12 items-stretch gap-[18px]">
            <KpiHero label="Valeur de marché" value={eur(data.total)} sub={`${signPct(data.dayPct)} aujourd'hui`} />
            <KpiCard label="Capital investi" value={eur(data.invested)} sub="Coût de revient total" />
            <KpiCard label="Plus-value latente" value={signEur(pl)} sub="Depuis l'origine" valColor={pl >= 0 ? "var(--pos)" : "var(--neg)"} />
            <KpiCard label="Performance globale" value={signPct(data.totalPnlPct * 100)} sub="Depuis le premier achat" valColor={data.totalPnlPct >= 0 ? "var(--pos)" : "var(--neg)"} />

            {data.accounts.length > 0 && (
              <section className="col-span-12 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] px-[26px] py-6" style={{ boxShadow: "var(--shadow)" }}>
                <h2 className="mb-4 text-[17px] font-bold text-[var(--fg)]">Mes comptes</h2>
                <div className="grid grid-cols-2 gap-[14px]">
                  {data.accounts.map((acc) => {
                    const plafondPct = acc.plafond ? Math.min((acc.deposited / acc.plafond) * 100, 100) : null;
                    return (
                      <div key={acc.id} className="rounded-[16px] border border-[var(--line)] bg-[var(--panel2)] p-5">
                        <div className="mb-4 flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-[14.5px] font-bold text-[var(--fg)]">{acc.name}</span>
                            <span className="text-[11px] uppercase tracking-wide text-[var(--fg3)]">{acc.type}</span>
                          </div>
                          <div className="text-right">
                            <span style={num} className="block text-[19px] font-bold text-[var(--fg)]">{eur(acc.total)}</span>
                            <span className={acc.totalPnl >= 0 ? "text-[12px] font-semibold text-[var(--pos)]" : "text-[12px] font-semibold text-[var(--neg)]"}>
                              {signEur(acc.totalPnl)}
                            </span>
                          </div>
                        </div>

                        {acc.plafond && (
                          <div className="mb-4">
                            <div className="mb-1 flex items-center justify-between text-[11.5px] text-[var(--fg2)]">
                              <span>Plafond PEA</span>
                              <span style={num}>{eur(acc.deposited)} / {eur(acc.plafond)}</span>
                            </div>
                            <div className="h-[6px] overflow-hidden rounded-[4px] bg-[var(--track)]">
                              <div className="h-full rounded-[4px]" style={{ width: `${plafondPct}%`, background: "var(--accent)" }} />
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-[2px]">
                            <span className="text-[11px] text-[var(--fg2)]">Capital déposé</span>
                            <span style={num} className="text-[14px] font-semibold text-[var(--fg)]">{eur(acc.deposited)}</span>
                          </div>
                          <div className="flex flex-col gap-[2px]">
                            <span className="text-[11px] text-[var(--fg2)]">Capital disponible</span>
                            <span style={num} className="text-[14px] font-semibold text-[var(--fg)]">{eur(acc.cash)}</span>
                          </div>
                          <div className="flex flex-col gap-[2px]">
                            <span className="text-[11px] text-[var(--fg2)]">+/- latente</span>
                            <span style={{ ...num, color: acc.unrealizedPnl >= 0 ? "var(--pos)" : "var(--neg)" }} className="text-[14px] font-semibold">{signEur(acc.unrealizedPnl)}</span>
                          </div>
                          <div className="flex flex-col gap-[2px]">
                            <span className="text-[11px] text-[var(--fg2)]">+/- réalisée (ventes)</span>
                            <span style={{ ...num, color: acc.realizedPnl >= 0 ? "var(--pos)" : "var(--neg)" }} className="text-[14px] font-semibold">{signEur(acc.realizedPnl)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] p-6" style={{ boxShadow: "var(--shadow)" }}>
              <h2 className="mb-4 text-[17px] font-bold text-[var(--fg)]">Par classe d'actifs</h2>
              <Donut donut={donut} centerTop="Classes" centerVal={String(data.alloc.length)} />
            </section>

            <section className="col-span-8 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] p-6" style={{ boxShadow: "var(--shadow)" }}>
              <h2 className="mb-[18px] text-[17px] font-bold text-[var(--fg)]">Exposition sectorielle</h2>
              {sectors.length === 0 ? (
                <p className="text-[13px] text-[var(--fg2)]">Aucune position pour l'instant.</p>
              ) : (
                <div className="flex flex-col gap-[14px]">
                  {sectors.map((s) => (
                    <div key={s.label} className="flex items-center gap-[14px]">
                      <span className="w-[130px] flex-none text-[13px] text-[var(--fg2)]">{s.label}</span>
                      <div className="h-[10px] flex-1 overflow-hidden rounded-[6px] bg-[var(--track)]">
                        <div className="h-full rounded-[6px]" style={{ width: `${s.barPct}%`, background: s.color }} />
                      </div>
                      <span style={num} className="w-12 text-right text-[13px] font-bold text-[var(--fg)]">{s.pct} %</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="col-span-6 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] p-6" style={{ boxShadow: "var(--shadow)" }}>
              <h2 className="mb-[18px] text-[17px] font-bold text-[var(--fg)]">Répartition géographique</h2>
              {geo.length === 0 ? (
                <p className="text-[13px] text-[var(--fg2)]">Aucune position pour l'instant.</p>
              ) : (
                <div className="flex flex-col gap-[14px]">
                  {geo.map((s) => (
                    <div key={s.label} className="flex items-center gap-[14px]">
                      <span className="w-[130px] flex-none text-[13px] text-[var(--fg2)]">{s.label}</span>
                      <div className="h-[10px] flex-1 overflow-hidden rounded-[6px] bg-[var(--track)]">
                        <div className="h-full rounded-[6px]" style={{ width: `${s.barPct}%`, background: s.color }} />
                      </div>
                      <span style={num} className="w-12 text-right text-[13px] font-bold text-[var(--fg)]">{s.pct} %</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="col-span-6 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] p-6" style={{ boxShadow: "var(--shadow)" }}>
              <h2 className="mb-[18px] text-[17px] font-bold text-[var(--fg)]">Exposition devises</h2>
              {currencies.length === 0 ? (
                <p className="text-[13px] text-[var(--fg2)]">Aucune position pour l'instant.</p>
              ) : (
                <div className="flex flex-col gap-[14px]">
                  {currencies.map((s) => (
                    <div key={s.label} className="flex items-center gap-[14px]">
                      <span className="w-[130px] flex-none text-[13px] text-[var(--fg2)]">{s.label}</span>
                      <div className="h-[10px] flex-1 overflow-hidden rounded-[6px] bg-[var(--track)]">
                        <div className="h-full rounded-[6px]" style={{ width: `${s.barPct}%`, background: s.color }} />
                      </div>
                      <span style={num} className="w-12 text-right text-[13px] font-bold text-[var(--fg)]">{s.pct} %</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="col-span-12 overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--panel)]" style={{ boxShadow: "var(--shadow)" }}>
              <div className="flex items-center justify-between px-6 pb-[14px] pt-[22px]">
                <h2 className="text-[17px] font-bold text-[var(--fg)]">Détail des positions</h2>
                <span className="text-[12.5px] text-[var(--fg2)]">{eur(positions.sum)} · {data.positions.length} lignes</span>
              </div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-y border-[var(--line)]">
                    {([
                      ["Actif", "name", "left", "px-6"],
                      ["Qté", null, "right", "px-[10px]"],
                      ["PRU", null, "right", "px-[10px]"],
                      ["Cours", null, "right", "px-[10px]"],
                      ["Valeur", "value", "right", "px-[10px]"],
                      ["+/- latente", null, "right", "px-[10px]"],
                      ["Performance", "totalPct", "right", "px-[10px]"],
                      ["Poids", "weight", "right", "px-6"],
                    ] as [string, SortKey | null, string, string][]).map(([label, key, align, pad]) => (
                      <th
                        key={label}
                        onClick={key ? () => toggleSort(key) : undefined}
                        className={`${pad} py-[9px] text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)] ${align === "right" ? "text-right" : "text-left"} ${key ? "cursor-pointer" : ""}`}
                      >
                        {label}
                        {key ? caret(key) : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.rows.map((p) => (
                    <tr key={p.ticker} className="border-b border-[var(--line)] hover:bg-[var(--panel2)]">
                      <td className="px-6 py-[11px]">
                        <div className="flex items-center gap-[11px]">
                          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] text-[11px] font-bold text-white opacity-90" style={{ background: allocColor(p.cls) }}>
                            {p.cls.slice(0, 2)}
                          </span>
                          <div className="flex flex-col leading-[1.25]">
                            <span className="font-bold text-[var(--fg)]">{p.name}</span>
                            <span className="text-[11px] text-[var(--fg3)]">{p.ticker} · {p.sector}</span>
                          </div>
                        </div>
                      </td>
                      <td style={num} className="px-[10px] py-[11px] text-right text-[var(--fg2)]">{nf(p.qty, p.qty % 1 ? 2 : 0)}</td>
                      <td style={num} className="px-[10px] py-[11px] text-right text-[var(--fg2)]">{eur(p.pru, 2)}</td>
                      <td className="px-[10px] py-[11px] text-right">
                        {editingPriceTicker === p.ticker ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="any"
                              autoFocus
                              value={priceInput}
                              onChange={(e) => setPriceInput(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && saveManualPrice(p.ticker)}
                              className="w-20 rounded-[6px] border px-2 py-1 text-right text-[12px] outline-none"
                              style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                            />
                            <button
                              type="button"
                              disabled={savingPrice}
                              onClick={() => saveManualPrice(p.ticker)}
                              className="rounded-[6px] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                              style={{ background: "var(--accent)" }}
                            >
                              ✓
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-[6px]">
                            {p.priceSource !== "live" && (
                              <span
                                className="rounded-[5px] px-[5px] py-[1px] text-[9.5px] font-semibold uppercase"
                                style={
                                  PRICE_SOURCE_OK.has(p.priceSource)
                                    ? { background: "var(--posbg)", color: "var(--pos)" }
                                    : { background: "var(--negbg)", color: "var(--neg)" }
                                }
                                title={PRICE_SOURCE_TITLE[p.priceSource]}
                              >
                                {PRICE_SOURCE_LABEL[p.priceSource]}
                              </span>
                            )}
                            <span style={num} className="text-[var(--fg2)]">{eur(p.price, 2)}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPriceTicker(p.ticker);
                                setPriceInput(String(p.price));
                              }}
                              className="text-[11px] text-[var(--fg3)] hover:text-[var(--accent)]"
                              title="Saisir un cours manuel"
                            >
                              ✎
                            </button>
                          </div>
                        )}
                      </td>
                      <td style={num} className="px-[10px] py-[11px] text-right font-bold text-[var(--fg)]">{eur(p.value)}</td>
                      <td style={{ ...num, color: p.pl >= 0 ? "var(--pos)" : "var(--neg)" }} className="px-[10px] py-[11px] text-right font-semibold">{signEur(p.pl)}</td>
                      <td style={{ ...num, color: p.totalPct >= 0 ? "var(--pos)" : "var(--neg)" }} className="px-[10px] py-[11px] text-right">{signPct(p.totalPct)}</td>
                      <td className="px-6 py-[11px] text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-[5px] w-11 overflow-hidden rounded-[3px] bg-[var(--track)]">
                            <div className="h-full rounded-[3px]" style={{ width: `${(p.weight / positions.maxW) * 100}%`, background: "var(--accent)" }} />
                          </div>
                          <span style={num} className="min-w-[40px] text-[var(--fg2)]">{nf(p.weight, 1)} %</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="col-span-12 overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--panel)]" style={{ boxShadow: "var(--shadow)" }}>
              <div className="flex items-center justify-between px-6 pb-[14px] pt-[22px]">
                <h2 className="text-[17px] font-bold text-[var(--fg)]">Ventes &amp; positions clôturées</h2>
                <span className={data.totalRealizedPnl >= 0 ? "text-[13px] font-bold text-[var(--pos)]" : "text-[13px] font-bold text-[var(--neg)]"} style={num}>
                  Plus-value réalisée totale&nbsp;: {signEur(data.totalRealizedPnl)}
                </span>
              </div>
              <p className="px-6 pb-3 text-[11.5px] text-[var(--fg3)]">
                Cumul sur toutes les ventes (positions ouvertes et clôturées). Ces gains réinvestis dans le PEA sont internes à l'enveloppe : ils ne consomment pas le plafond de versement.
              </p>
              {data.closedPositions.length === 0 ? (
                <p className="px-6 pb-6 text-[13px] text-[var(--fg2)]">Aucune position intégralement clôturée pour l'instant.</p>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-y border-[var(--line)]">
                      <th className="px-6 py-[9px] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)]">Actif</th>
                      <th className="px-[10px] py-[9px] text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)]">Plus-value réalisée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.closedPositions.map((cp) => (
                      <tr key={cp.ticker} className="border-b border-[var(--line)] hover:bg-[var(--panel2)]">
                        <td className="px-6 py-[11px]">
                          <div className="flex flex-col leading-[1.25]">
                            <span className="font-bold text-[var(--fg)]">{cp.name}</span>
                            <span className="text-[11px] text-[var(--fg3)]">{cp.ticker} · {cp.sector}</span>
                          </div>
                        </td>
                        <td style={{ ...num, color: cp.realizedPnl >= 0 ? "var(--pos)" : "var(--neg)" }} className="px-[10px] py-[11px] text-right font-semibold">
                          {signEur(cp.realizedPnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}

        {/* ════════════════════════ HISTORIQUE ════════════════════════ */}
        {page === "historique" && (
          <div className="grid grid-cols-12 items-stretch gap-[18px]">
            <HistoryView />
          </div>
        )}

        {/* ════════════════════════ MARCHÉS ════════════════════════ */}
        {page === "marches" && (
          <div className="grid grid-cols-12 items-stretch gap-[18px]">
            <section className="col-span-8 overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--panel)]" style={{ boxShadow: "var(--shadow)" }}>
              <div className="flex items-center justify-between px-6 pb-[14px] pt-[22px]">
                <h2 className="text-[17px] font-bold text-[var(--fg)]">Ta liste de suivi</h2>
                <span className="text-[12.5px] text-[var(--fg2)]">{watchlist.length} actif(s)</span>
              </div>
              {watchlist.length === 0 ? (
                <p className="px-6 pb-6 text-[13px] text-[var(--fg2)]">
                  Pas encore d'actif suivi — cherche-en un ci-dessous et clique sur « + Suivre ».
                </p>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-y border-[var(--line)]">
                      {[["Instrument", "left", "px-6"], ["Cours", "right", "px-3"], ["Jour", "right", "px-3"], ["", "right", "px-6"]].map(([l, a, pad], i) => (
                        <th key={i} className={`${pad} py-[9px] text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)] ${a === "right" ? "text-right" : "text-left"}`}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {watchlist.map((w) => (
                      <tr key={w.ticker} className="border-b border-[var(--line)] hover:bg-[var(--panel2)]">
                        <td className="px-6 py-[11px]">
                          <div className="flex flex-col leading-[1.25]">
                            <span className="font-bold text-[var(--fg)]">{w.name}</span>
                            <span className="text-[11px] text-[var(--fg3)]">{w.ticker}</span>
                          </div>
                        </td>
                        <td className="px-3 py-[11px] text-right">
                          {editingWatchTicker === w.ticker ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                step="any"
                                autoFocus
                                value={watchPriceInput}
                                onChange={(e) => setWatchPriceInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && saveWatchManualPrice(w.ticker)}
                                className="w-20 rounded-[6px] border px-2 py-1 text-right text-[12px] outline-none"
                                style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                              />
                              <button
                                type="button"
                                disabled={savingWatchPrice}
                                onClick={() => saveWatchManualPrice(w.ticker)}
                                className="rounded-[6px] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                                style={{ background: "var(--accent)" }}
                              >
                                ✓
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-[6px]">
                              {w.priceSource !== "live" && w.priceSource !== "none" && (
                                <span
                                  className="rounded-[5px] px-[5px] py-[1px] text-[9.5px] font-semibold uppercase"
                                  style={
                                    PRICE_SOURCE_OK.has(w.priceSource)
                                      ? { background: "var(--posbg)", color: "var(--pos)" }
                                      : { background: "var(--negbg)", color: "var(--neg)" }
                                  }
                                >
                                  {PRICE_SOURCE_LABEL[w.priceSource]}
                                </span>
                              )}
                              <span style={num} className="font-semibold text-[var(--fg)]">{w.price !== null ? eur(w.price, 2) : "—"}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingWatchTicker(w.ticker);
                                  setWatchPriceInput(w.price !== null ? String(w.price) : "");
                                }}
                                className="text-[11px] text-[var(--fg3)] hover:text-[var(--accent)]"
                                title="Saisir un cours manuel"
                              >
                                ✎
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-[11px] text-right">
                          {w.day !== null ? (
                            <span style={{ ...num, color: w.day >= 0 ? "var(--pos)" : "var(--neg)", background: w.day >= 0 ? "var(--posbg)" : "var(--negbg)" }} className="rounded-[7px] px-2 py-[3px] text-[12px] font-bold">{signPct(w.day)}</span>
                          ) : (
                            <span className="text-[12px] text-[var(--fg3)]">—</span>
                          )}
                        </td>
                        <td className="px-6 py-[11px] text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              await fetch(`/api/watchlist?ticker=${encodeURIComponent(w.ticker)}`, { method: "DELETE" });
                              removeWatchlistItem(w.ticker);
                            }}
                            className="text-[11px] text-[var(--fg3)] hover:text-[var(--neg)]"
                          >
                            Retirer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] px-6 py-[22px]" style={{ boxShadow: "var(--shadow)" }}>
              <h2 className="mb-[14px] text-[17px] font-bold text-[var(--fg)]">Mouvements (positions + watchlist)</h2>
              <MoversList title="Hausses" tone="pos" items={movers.up} />
              <div className="h-3" />
              <MoversList title="Baisses" tone="neg" items={movers.down} />
            </section>

            <section className="col-span-12">
              <h2 className="mb-[14px] text-[17px] font-bold text-[var(--fg)]">Chercher une action ou un ETF</h2>
              <MarketsBrowser watchlist={watchlist} onAdd={addWatchlistItem} onRemove={removeWatchlistItem} />
            </section>
          </div>
        )}

        {/* ════════════════════════ OBJECTIFS ════════════════════════ */}
        {page === "objectifs" && (
          <div className="grid grid-cols-12 items-stretch gap-[18px]">
            <section
              className="relative col-span-5 flex items-center gap-6 overflow-hidden rounded-[22px] p-[26px]"
              style={{ background: "linear-gradient(150deg, var(--accent), var(--accent2))", boxShadow: "var(--shadow)" }}
            >
              <div className="absolute -bottom-[50px] -right-10 h-[170px] w-[170px] rounded-full bg-white/10" />
              <div className="relative h-[124px] w-[124px] flex-none">
                <svg width="124" height="124" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="13" />
                  <circle cx="60" cy="60" r="52" fill="none" stroke="#fff" strokeWidth="13" strokeLinecap="round" strokeDasharray={ringDash} transform="rotate(-90 60 60)" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center leading-[1.05]">
                  <span style={num} className="whitespace-nowrap text-[22px] font-bold text-white">{nf(goalPct, 1)} %</span>
                  <span className="text-[9.5px] uppercase tracking-[.08em] text-white/80">atteint</span>
                </div>
              </div>
              <div className="relative flex flex-col gap-3">
                <div className="flex flex-col">
                  <span className="text-[12.5px] text-white/80">Patrimoine actuel</span>
                  <span style={num} className="text-[26px] font-bold text-white">{eur(data.total)}</span>
                </div>
                <div className="flex gap-[22px]">
                  <div className="flex flex-col">
                    <span className="text-[11.5px] text-white/75">Objectif</span>
                    <span style={num} className="text-[15px] font-semibold text-white">{data.goal ? eur(data.goal) : "—"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11.5px] text-white/75">Reste</span>
                    <span style={num} className="text-[15px] font-semibold text-white">{data.goal ? eur(Math.max(data.goal - data.total, 0)) : "—"}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="col-span-7 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] px-[26px] py-6" style={{ boxShadow: "var(--shadow)" }}>
              <h2 className="mb-4 text-[17px] font-bold text-[var(--fg)]">Modifier l&apos;objectif</h2>
              <GoalForm initialGoal={data.goal} />
            </section>

            <section className="col-span-12 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] px-[26px] py-6" style={{ boxShadow: "var(--shadow)" }}>
              <div className="mb-[14px] flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-[17px] font-bold text-[var(--fg)]">Simulation de projection</h2>
                  <span className="text-[12.5px] text-[var(--fg2)]">
                    Basée sur ton capital actuel ({eur(data.total)}) vs ton objectif — se réajuste avec le PnL réel et tes positions.
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-[12.5px] text-[var(--fg2)]">
                    Taux annuel
                    <input
                      type="number"
                      step="0.5"
                      value={projRate}
                      onChange={(e) => setProjRate(Number(e.target.value))}
                      className="w-16 rounded-[8px] border px-2 py-1 text-[13px] outline-none"
                      style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                    />
                    %
                  </label>
                  <label className="flex items-center gap-2 text-[12.5px] text-[var(--fg2)]">
                    Versement
                    <input
                      type="number"
                      step="50"
                      value={projMonthly}
                      onChange={(e) => setProjMonthly(Number(e.target.value))}
                      className="w-20 rounded-[8px] border px-2 py-1 text-[13px] outline-none"
                      style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                    />
                    €/mois
                  </label>
                </div>
              </div>

              {data.goal ? (
                <div
                  className="mb-4 rounded-[14px] px-4 py-3 text-[13px]"
                  style={{ background: "var(--panel2)", color: "var(--fg)" }}
                >
                  {timeToGoal ? (
                    <>
                      Au rythme de <strong>{nf(projRate, 1)} %/an</strong> et <strong>{eur(projMonthly)}/mois</strong>, tu atteindras ton
                      objectif de <strong>{eur(data.goal)}</strong> dans environ{" "}
                      <strong style={{ color: "var(--accent2)" }}>
                        {timeToGoal.years === 0 && timeToGoal.months === 0
                          ? "0 mois — déjà atteint"
                          : `${timeToGoal.years > 0 ? `${timeToGoal.years} an${timeToGoal.years > 1 ? "s" : ""}` : ""}${timeToGoal.years > 0 && timeToGoal.months > 0 ? " et " : ""}${timeToGoal.months > 0 ? `${timeToGoal.months} mois` : ""}`}
                      </strong>
                      .
                    </>
                  ) : (
                    <>À ce taux et ce versement, l'objectif ne serait pas atteint avant 60 ans — augmente le taux ou le versement mensuel.</>
                  )}
                </div>
              ) : (
                <p className="mb-4 text-[13px] text-[var(--fg2)]">Définis un objectif ci-dessus pour voir l'estimation.</p>
              )}

              <div className="relative h-[196px]">
                <svg width="100%" height="100%" viewBox="0 0 1000 300" preserveAspectRatio="none" className="block overflow-visible">
                  <defs>
                    <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" style={{ stopColor: "var(--accent)", stopOpacity: 0.3 }} />
                      <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
                    </linearGradient>
                  </defs>
                  {projection.goalLineY !== null && (
                    <line x1="0" y1={projection.goalLineY} x2="1000" y2={projection.goalLineY} style={{ stroke: "var(--accent)" }} strokeWidth={1.5} strokeDasharray="5 6" />
                  )}
                  <path d={projection.area} fill="url(#projGrad)" />
                  <path d={projection.line} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </svg>
                {projection.goalLabelTopPct !== null && data.goal && (
                  <span
                    className="absolute right-1 -translate-y-1/2 rounded-[6px] bg-[var(--panel)] px-[6px] py-[1px] text-[10.5px] font-semibold text-[var(--accent)]"
                    style={{ top: `${projection.goalLabelTopPct}%` }}
                  >
                    Objectif {eur(data.goal)}
                  </span>
                )}
              </div>
              <ChartLabels labels={projection.labels} />
              <div className="mt-3 flex items-center gap-2 text-[12.5px] text-[var(--fg2)]">
                Valeur estimée dans {projectionYears} an{projectionYears > 1 ? "s" : ""} :
                <span style={num} className="font-bold text-[var(--fg)]">{eur(projection.endValue)}</span>
              </div>
            </section>

            <section className="col-span-12 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] px-[26px] py-6" style={{ boxShadow: "var(--shadow)" }}>
              <h2 className="mb-1 text-[17px] font-bold text-[var(--fg)]">Simulateur FIRE</h2>
              <p className="mb-4 text-[12.5px] text-[var(--fg2)]">
                À quel âge veux-tu être indépendant financièrement (FIRE) ? On calcule combien il te faudrait investir chaque mois pour y arriver.
              </p>

              <div className="mb-4 grid grid-cols-3 gap-3">
                <label className="flex flex-col gap-1 text-[12px] text-[var(--fg2)]">
                  Date de naissance
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => {
                      setBirthDate(e.target.value);
                      saveFireProfile(e.target.value, fireAge);
                    }}
                    className="rounded-[10px] border px-3 py-2 text-[13px] outline-none"
                    style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-[var(--fg2)]">
                  Âge FIRE visé
                  <input
                    type="number"
                    step="1"
                    value={fireAge}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setFireAge(v);
                      saveFireProfile(birthDate, v);
                    }}
                    className="rounded-[10px] border px-3 py-2 text-[13px] outline-none"
                    style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-[var(--fg2)]">
                  Taux annuel estimé
                  <input
                    type="number"
                    step="0.5"
                    value={fireRate}
                    onChange={(e) => setFireRate(Number(e.target.value))}
                    className="rounded-[10px] border px-3 py-2 text-[13px] outline-none"
                    style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                  />
                </label>
              </div>

              {!birthDate ? (
                <p className="text-[13px] text-[var(--fg2)]">Renseigne ta date de naissance pour utiliser le simulateur FIRE.</p>
              ) : !data.goal ? (
                <p className="text-[13px] text-[var(--fg2)]">Définis un objectif ci-dessus pour utiliser le simulateur FIRE.</p>
              ) : yearsToFire !== null && yearsToFire <= 0 ? (
                <div className="rounded-[14px] px-4 py-3 text-[13px]" style={{ background: "var(--panel2)", color: "var(--fg)" }}>
                  Tu as déjà {currentAge} ans, l&apos;âge FIRE visé ({fireAge} ans) est déjà atteint ou dépassé.
                </div>
              ) : (
                <div className="rounded-[14px] px-4 py-3 text-[13px]" style={{ background: "var(--panel2)", color: "var(--fg)" }}>
                  Tu as <strong>{currentAge} ans</strong>, soit <strong style={{ color: "var(--accent2)" }}>{yearsToFire} an{(yearsToFire ?? 0) > 1 ? "s" : ""}</strong> avant l&apos;âge FIRE visé de {fireAge} ans.
                  {requiredMonthly !== null && Number.isFinite(requiredMonthly) ? (
                    requiredMonthly <= 0 ? (
                      <> Avec <strong>{eur(data.total)}</strong> déjà investis à <strong>{nf(fireRate, 1)} %/an</strong>, tu es déjà sur la trajectoire pour atteindre <strong>{eur(data.goal)}</strong> sans effort supplémentaire.</>
                    ) : (
                      <>
                        {" "}Avec <strong>{eur(data.total)}</strong> déjà investis à <strong>{nf(fireRate, 1)} %/an</strong>, il te faudrait investir environ{" "}
                        <strong style={{ color: "var(--accent2)" }}>{eur(requiredMonthly)}/mois</strong> pour atteindre ton objectif de <strong>{eur(data.goal)}</strong>.
                      </>
                    )
                  ) : (
                    <> À ce taux, l&apos;objectif de <strong>{eur(data.goal)}</strong> ne serait pas atteignable dans ce délai.</>
                  )}
                </div>
              )}

              <div className="mt-4">
                <p className="mb-2 text-[12px] text-[var(--fg2)]">
                  Comparer avec des rentabilités historiques moyennes (à titre indicatif, le passé ne garantit pas le futur) :
                </p>
                <div className="flex flex-wrap gap-2">
                  {HISTORICAL_BENCHMARKS.map((b) => (
                    <button
                      key={b.label}
                      type="button"
                      onClick={() => setFireRate(b.ratePct)}
                      className="rounded-full border px-3 py-1.5 text-[12px] transition"
                      style={{
                        borderColor: fireRate === b.ratePct ? "var(--accent)" : "var(--line)",
                        background: fireRate === b.ratePct ? "var(--posbg)" : "var(--panel2)",
                        color: "var(--fg)",
                      }}
                      title={b.note}
                    >
                      {b.label} · {nf(b.ratePct, 1)} %
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ════════════════════════ IMPORTER ════════════════════════ */}
        {page === "import" && (
          <div className="grid grid-cols-12 gap-[18px]">
            <div className="col-span-6 flex flex-col gap-[18px]">
              <AccountManager accounts={accounts} />

              <section className="rounded-[22px] border p-6" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
                <TRCsvImport />
              </section>

              {accounts.length === 0 ? (
                <p className="text-[13px] text-[var(--fg2)]">
                  Crée un compte ci-dessus pour pouvoir importer un PDF, saisir une transaction ou créer un plan DCA.
                </p>
              ) : (
                <>
                  <section className="rounded-[22px] border p-6" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
                    <h2 className="mb-1 text-[17px] font-bold text-[var(--fg)]">Import PDF</h2>
                    <p className="mb-4 text-[12.5px] text-[var(--fg2)]">
                      Confirmations Boursorama — glisse-dépose plusieurs fichiers à la fois
                    </p>
                    <ImportDropzone accounts={accounts} />
                  </section>

                  <section className="rounded-[22px] border p-6" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
                    <h2 className="mb-1 text-[17px] font-bold text-[var(--fg)]">Saisie manuelle</h2>
                    <p className="mb-4 text-[12.5px] text-[var(--fg2)]">
                      Pour les transactions Trade Republic ou tout actif non couvert par l'import PDF
                    </p>
                    <ManualTransactionForm accounts={accounts} />
                  </section>

                  <section className="rounded-[22px] border p-6" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
                    <h2 className="mb-1 text-[17px] font-bold text-[var(--fg)]">Plan d&apos;investissement programmé (DCA)</h2>
                    <p className="mb-4 text-[12.5px] text-[var(--fg2)]">
                      Pour les plans récurrents Trade Republic — génère automatiquement les exécutions
                      passées en projection
                    </p>
                    <DcaRuleForm accounts={accounts} />
                    <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--line)" }}>
                      <h3 className="mb-1 text-[15px] font-bold text-[var(--fg)]">Plans existants</h3>
                      <DcaRulesManager />
                    </div>
                  </section>

                  <section className="rounded-[22px] border p-6" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
                    <h2 className="mb-1 text-[17px] font-bold text-[var(--fg)]">Historique de valorisation (CSV)</h2>
                    <p className="mb-4 text-[12.5px] text-[var(--fg2)]">
                      Export "Performance" du courtier (date + valorisation quotidienne) — remplace l&apos;estimation par cours
                      mensuels dans la courbe Capital total par les vraies valeurs, quand elles couvrent la période affichée.
                    </p>
                    <PerformanceCsvImport accounts={accounts} />
                  </section>
                </>
              )}
            </div>

            <div className="col-span-6">
              <section className="rounded-[22px] border p-6" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
                <h2 className="mb-1 text-[17px] font-bold text-[var(--fg)]">Transactions enregistrées</h2>
                <p className="mb-4 text-[12.5px] text-[var(--fg2)]">Modifie ou supprime une ligne en cas d&apos;erreur d&apos;import ou de saisie</p>
                <TransactionsManager />
              </section>
            </div>
          </div>
        )}
      </div>

      {isEmpty && bannerDismissed && (
        <div className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-center px-4 pb-4">
          <div
            className="flex items-center gap-3 rounded-full border px-4 py-[9px]"
            style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}
          >
            <span className="text-[12.5px] text-[var(--fg2)]">
              Pense à importer ou saisir tes données pour suivre ton patrimoine.
            </span>
            <button
              onClick={() => setPage("import")}
              className="rounded-full px-3 py-[5px] text-[12px] font-semibold text-white"
              style={{ background: "linear-gradient(140deg, var(--accent), var(--accent2))" }}
            >
              Importer
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ============================================================
// Sous-composants présentiels
// ============================================================

function EvolutionSvg({
  id,
  area,
  lineTotal,
  lineVerse,
  lastTopPctTotal,
  lastTopPctVerse,
  points,
}: {
  id: string;
  area: string;
  lineTotal: string;
  lineVerse: string;
  lastTopPctTotal: number;
  lastTopPctVerse: number;
  points: import("./atelier-data").EvolutionPoint[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = containerRef.current;
    if (!el || points.length === 0) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const idx = points.length === 1 ? 0 : Math.round(frac * (points.length - 1));
    setHoverIdx(idx);
  }

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;
  const tooltipLeft = hovered ? Math.min(Math.max(hovered.xPct, 8), 92) : 0;
  const tooltipTop = hovered ? Math.min(hovered.yPctTotal, hovered.yPctVerse) : 0;

  return (
    <div
      ref={containerRef}
      className="relative h-[218px] cursor-crosshair"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverIdx(null)}
    >
      <svg width="100%" height="100%" viewBox="0 0 1000 300" preserveAspectRatio="none" className="block overflow-visible">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--accent)", stopOpacity: 0.3 }} />
            <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} />
        <path d={lineVerse} fill="none" style={{ stroke: "var(--fg3)" }} strokeWidth={2} strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={lineTotal} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hovered && (
          <line
            x1={hovered.xPct * 10}
            x2={hovered.xPct * 10}
            y1={0}
            y2={300}
            stroke="var(--fg3)"
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="absolute -right-[5px] h-[13px] w-[13px] -translate-y-1/2 rounded-full border-[3px] border-[var(--panel)] bg-[var(--accent)]" style={{ top: `${lastTopPctTotal}%` }} />
      <div className="absolute -right-[4px] h-[10px] w-[10px] -translate-y-1/2 rounded-full border-[2px] border-[var(--panel)] bg-[var(--fg3)]" style={{ top: `${lastTopPctVerse}%` }} />
      {hovered && (
        <>
          <div
            className="absolute h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[2px] border-[var(--panel)] bg-[var(--accent)]"
            style={{ left: `${hovered.xPct}%`, top: `${hovered.yPctTotal}%` }}
          />
          <div
            className="absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[2px] border-[var(--panel)] bg-[var(--fg3)]"
            style={{ left: `${hovered.xPct}%`, top: `${hovered.yPctVerse}%` }}
          />
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-[10px] border px-3 py-2 text-[12px] shadow-lg"
            style={{
              left: `${tooltipLeft}%`,
              top: `${Math.max(tooltipTop - 4, 0)}%`,
              borderColor: "var(--line)",
              background: "var(--panel)",
              color: "var(--fg)",
            }}
          >
            <div className="font-semibold capitalize">{hovered.dateLabel}</div>
            <div className="mt-[4px] flex flex-col gap-[2px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--fg2)]">Capital total</span>
                <span style={num} className="font-bold">{eur(hovered.valueTotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--fg2)]">Capital versé</span>
                <span style={num} className="font-semibold text-[var(--fg2)]">{eur(hovered.valueVerse)}</span>
              </div>
            </div>
            <div className={hovered.pctVsDeposits >= 0 ? "mt-[2px] text-[var(--pos)]" : "mt-[2px] text-[var(--neg)]"}>
              {signPct(hovered.pctVsDeposits)} vs capital versé
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ChartLabels({ labels }: { labels: { leftPct: number; text: string }[] }) {
  return (
    <div className="relative mt-[6px] h-4">
      {labels.map((l, i) => (
        <span key={i} className="absolute -translate-x-1/2 text-[11px] text-[var(--fg3)]" style={{ left: `${l.leftPct}%` }}>{l.text}</span>
      ))}
    </div>
  );
}

function Donut({
  donut,
  centerTop,
  centerVal,
}: {
  donut: { label: string; color: string; pctFmt: string; dash: string; offset: number }[];
  centerTop: string;
  centerVal: string;
}) {
  return (
    <div className="flex items-center gap-[18px]">
      <div className="relative flex-none">
        <svg width="128" height="128" viewBox="0 0 200 200">
          <g transform="rotate(-90 100 100)">
            {donut.map((s, i) => (
              <circle key={i} cx="100" cy="100" r="70" fill="none" stroke={s.color} strokeWidth="22" strokeDasharray={s.dash} strokeDashoffset={s.offset} strokeLinecap="round" />
            ))}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-[1.1]">
          <span className="text-[10px] uppercase tracking-wider text-[var(--fg3)]">{centerTop}</span>
          <span style={num} className="text-[20px] font-bold text-[var(--fg)]">{centerVal}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {donut.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-[9px] w-[9px] flex-none rounded-[3px]" style={{ background: s.color }} />
            <span className="flex-1 text-[12.5px] text-[var(--fg2)]">{s.label}</span>
            <span style={num} className="min-w-[38px] text-right text-[12.5px] font-bold text-[var(--fg)]">{s.pctFmt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerfBars({ bars }: { bars: { label: string; pct: number; width: number; pos: boolean }[] }) {
  return (
    <div className="flex flex-col gap-[13px]">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-3">
          <span className="w-[74px] flex-none text-[12.5px] text-[var(--fg2)]">{b.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-[5px] bg-[var(--track)]">
            <div className="h-full rounded-[5px]" style={{ width: `${b.width}%`, background: b.pos ? "var(--pos)" : "var(--neg)" }} />
          </div>
          <span style={{ ...num, color: b.pos ? "var(--pos)" : "var(--neg)" }} className="w-[60px] text-right text-[12.5px] font-bold">{signPct(b.pct)}</span>
        </div>
      ))}
    </div>
  );
}

function Ring({ dash, pct }: { dash: string; pct: number }) {
  return (
    <div className="relative h-24 w-24 flex-none">
      <svg width="96" height="96" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--track)" strokeWidth="12" />
        <circle cx="60" cy="60" r="52" fill="none" style={{ stroke: "var(--accent)" }} strokeWidth="12" strokeLinecap="round" strokeDasharray={dash} transform="rotate(-90 60 60)" />
      </svg>
      <div style={num} className="absolute inset-0 flex items-center justify-center text-[18px] font-bold text-[var(--fg)]">{nf(pct, 1)} %</div>
    </div>
  );
}

function MoversList({ title, tone, items }: { title: string; tone: "pos" | "neg"; items: { name: string; ticker?: string; pct: number }[] }) {
  const color = tone === "pos" ? "var(--pos)" : "var(--neg)";
  return (
    <>
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>{title}</span>
      <div className="mt-[9px] flex flex-col gap-[9px]">
        {items.length === 0 && <span className="text-[12.5px] text-[var(--fg3)]">—</span>}
        {items.map((m) => (
          <div key={m.name} className="flex items-center justify-between text-[13px]">
            {m.ticker ? (
              <div className="flex flex-col leading-[1.2]">
                <span className="font-semibold text-[var(--fg)]">{m.name}</span>
                <span className="text-[11px] text-[var(--fg3)]">{m.ticker}</span>
              </div>
            ) : (
              <span className="text-[var(--fg)]">{m.name}</span>
            )}
            <span style={{ ...num, color }} className="font-bold">{signPct(m.pct)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function KpiHero({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <section className="relative col-span-3 flex flex-col gap-2 overflow-hidden rounded-[22px] p-[22px]" style={{ background: "linear-gradient(150deg, var(--accent), var(--accent2))", boxShadow: "var(--shadow)" }}>
      <div className="absolute -right-[30px] -top-[30px] h-[120px] w-[120px] rounded-full bg-white/10" />
      <span className="relative text-[12.5px] font-semibold text-white/80">{label}</span>
      <span style={num} className="relative text-[30px] font-bold leading-none text-white">{value}</span>
      <span className="relative text-[12px] text-white/85">{sub}</span>
    </section>
  );
}

function KpiCard({ label, value, sub, valColor }: { label: string; value: string; sub: string; valColor?: string }) {
  return (
    <section className="col-span-3 flex flex-col justify-center gap-[7px] rounded-[22px] border border-[var(--line)] bg-[var(--panel)] p-[22px]" style={{ boxShadow: "var(--shadow)" }}>
      <span className="text-[12px] text-[var(--fg2)]">{label}</span>
      <span style={{ ...num, color: valColor ?? "var(--fg)" }} className="text-[26px] font-bold leading-none">{value}</span>
      <span className="text-[12px] text-[var(--fg3)]">{sub}</span>
    </section>
  );
}

function PositionsTable({
  positions,
  sortKey,
  sortDir,
  toggleSort,
  caret,
  allocColor,
}: {
  positions: { rows: { name: string; ticker: string; cls: string; price: number; value: number; day: number; weight: number }[]; sum: number };
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  toggleSort: (key: SortKey) => void;
  caret: (key: SortKey) => string;
  allocColor: (cls: string) => string;
}) {
  return (
    <section className="col-span-8 overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--panel)]" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex items-center justify-between px-6 pb-[14px] pt-[22px]">
        <h2 className="text-[17px] font-bold text-[var(--fg)]">Positions</h2>
        <span className="text-[12.5px] text-[var(--fg2)]">{eur(positions.sum)}</span>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-y border-[var(--line)]">
            {([
              ["Actif", "name", "left", "px-6"],
              ["Cours", null, "right", "px-3"],
              ["Valeur", "value", "right", "px-3"],
              ["Jour", "day", "right", "px-3"],
              ["Poids", "weight", "right", "px-6"],
            ] as [string, SortKey | null, string, string][]).map(([label, key, align, pad]) => (
              <th
                key={label}
                onClick={key ? () => toggleSort(key) : undefined}
                className={`${pad} py-[9px] text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)] ${align === "right" ? "text-right" : "text-left"} ${key ? "cursor-pointer" : ""}`}
              >
                {label}
                {key ? caret(key) : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.rows.map((p) => (
            <tr key={p.ticker} className="border-b border-[var(--line)] hover:bg-[var(--panel2)]">
              <td className="px-6 py-[11px]">
                <div className="flex items-center gap-[11px]">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] text-[11px] font-bold text-white opacity-90" style={{ background: allocColor(p.cls) }}>
                    {p.cls.slice(0, 2)}
                  </span>
                  <div className="flex flex-col leading-[1.25]">
                    <span className="font-bold text-[var(--fg)]">{p.name}</span>
                    <span className="text-[11px] text-[var(--fg3)]">{p.ticker}</span>
                  </div>
                </div>
              </td>
              <td style={num} className="px-3 py-[11px] text-right text-[var(--fg2)]">{eur(p.price, 2)}</td>
              <td style={num} className="px-3 py-[11px] text-right font-bold text-[var(--fg)]">{eur(p.value)}</td>
              <td className="px-3 py-[11px] text-right">
                <span style={{ ...num, color: p.day >= 0 ? "var(--pos)" : "var(--neg)", background: p.day >= 0 ? "var(--posbg)" : "var(--negbg)" }} className="rounded-[7px] px-2 py-[3px] text-[12px] font-bold">
                  {signPct(p.day)}
                </span>
              </td>
              <td style={num} className="px-6 py-[11px] text-right text-[var(--fg2)]">{nf(p.weight, 1)} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
