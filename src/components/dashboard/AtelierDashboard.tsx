"use client";

// ============================================================
// AtelierDashboard.tsx
// Dashboard patrimonial — direction "Atelier" (bento, dégradé, cartes douces).
// Interactif : toggle clair/sombre, tri des positions, sélection de période.
// Styling : Tailwind (classes utilitaires) + variables CSS de thème.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardNav } from "./DashboardNav";
import {
  type DashboardData,
  type Period,
  type Theme,
  PALETTE,
  buildEvolution,
  buildDonut,
  buildRing,
  nf,
  eur,
  signPct,
  signEur,
} from "./atelier-data";

type SortKey = "name" | "value" | "day" | "weight";

const PERIODS: Period[] = ["1M", "3M", "6M", "1A", "Max"];

export function AtelierDashboard({
  data,
  signOutAction,
}: {
  data: DashboardData;
  signOutAction?: () => void | Promise<void>;
}) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [period, setPeriod] = useState<Period>("1A");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const isEmpty = data.positions.length === 0 && data.cash <= 0;

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

  // ── Dérivés ──────────────────────────────────────────────
  const positions = useMemo(() => {
    let sum = 0;
    const enriched = data.positions.map((p) => {
      const value = p.qty * p.price;
      sum += value;
      return { ...p, value };
    });
    const withWeight = enriched.map((p) => ({ ...p, weight: (p.value / sum) * 100 }));
    const maxW = Math.max(...withWeight.map((p) => p.weight));
    const sorted = [...withWeight].sort((a, b) => {
      if (sortKey === "name") return sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return { rows: sorted, sum, maxW };
  }, [data.positions, sortKey, sortDir]);

  const chart = useMemo(() => buildEvolution(data.evo, period), [data.evo, period]);
  const donut = useMemo(() => buildDonut(data.alloc), [data.alloc]);
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

  const allocColor = (cls: string) => data.alloc.find((a) => a.label === cls)?.color ?? "var(--fg3)";

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }
  const caret = (key: SortKey) => (sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "");

  const num = { fontFamily: "var(--font-num, 'Space Grotesk', system-ui)" } as const;

  // ── Rendu ────────────────────────────────────────────────
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
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: "linear-gradient(140deg, var(--accent), var(--accent2))", boxShadow: "0 6px 18px -6px var(--accent)" }}
              >
                <div className="h-[13px] w-[13px] rounded-[4px] bg-white" />
              </div>
              <span className="text-[19px] font-extrabold tracking-tight text-[var(--fg)]">Atelier</span>
            </div>
            <DashboardNav />
          </div>
          <div className="flex items-center gap-[14px]">
            {/* Toggle thème */}
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
            <div className="flex items-center gap-[9px] rounded-xl border border-[var(--line)] bg-[var(--panel)] px-[14px] py-2">
              <span className="text-[12px] text-[var(--fg3)]">Liquidités</span>
              <span style={num} className="text-[13px] font-semibold text-[var(--fg)]">{eur(data.cash)}</span>
            </div>
            <div className="flex items-center gap-[9px]">
              <div
                className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-[14px] font-bold text-white"
                style={{ background: "linear-gradient(140deg, var(--accent), var(--accent2))" }}
                title={data.email}
              >
                {data.name.charAt(0)}
              </div>
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
              <Link
                href="/import"
                className="rounded-[11px] px-4 py-[9px] text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(140deg, var(--accent), var(--accent2))" }}
              >
                Aller à l'import
              </Link>
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

        {/* Bento grid */}
        <div className="grid grid-cols-12 items-stretch gap-[18px]">
          {/* Hero */}
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

          {/* Évolution */}
          <section className="col-span-8 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] px-[26px] py-6" style={{ boxShadow: "var(--shadow)" }}>
            <div className="mb-[14px] flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[17px] font-bold text-[var(--fg)]">Capital versé</h2>
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
            <div className="relative h-[218px]">
              <svg width="100%" height="100%" viewBox="0 0 1000 300" preserveAspectRatio="none" className="block overflow-visible">
                <defs>
                  <linearGradient id="atelierEvo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" style={{ stopColor: "var(--accent)", stopOpacity: 0.3 }} />
                    <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
                  </linearGradient>
                </defs>
                <path d={chart.area} fill="url(#atelierEvo)" />
                <path
                  d={chart.line}
                  fill="none"
                  style={{ stroke: "var(--accent)" }}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div
                className="absolute -right-[5px] h-[13px] w-[13px] -translate-y-1/2 rounded-full border-[3px] border-[var(--panel)] bg-[var(--accent)]"
                style={{ top: `${chart.lastTopPct}%` }}
              />
            </div>
            <div className="relative mt-[6px] h-4">
              {chart.labels.map((l, i) => (
                <span key={i} className="absolute -translate-x-1/2 text-[11px] text-[var(--fg3)]" style={{ left: `${l.leftPct}%` }}>
                  {l.text}
                </span>
              ))}
            </div>
          </section>

          {/* Allocation */}
          <section className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] p-6" style={{ boxShadow: "var(--shadow)" }}>
            <h2 className="mb-4 text-[17px] font-bold text-[var(--fg)]">Répartition d'actifs</h2>
            <div className="flex items-center gap-[18px]">
              <div className="relative flex-none">
                <svg width="128" height="128" viewBox="0 0 200 200">
                  <g transform="rotate(-90 100 100)">
                    {donut.map((s, i) => (
                      <circle
                        key={i}
                        cx="100"
                        cy="100"
                        r="70"
                        fill="none"
                        stroke={s.color}
                        strokeWidth="22"
                        strokeDasharray={s.dash}
                        strokeDashoffset={s.offset}
                        strokeLinecap="round"
                      />
                    ))}
                  </g>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center leading-[1.1]">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--fg3)]">Lignes</span>
                  <span style={num} className="text-[20px] font-bold text-[var(--fg)]">{data.positions.length}</span>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {donut.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="h-[9px] w-[9px] flex-none rounded-[3px]" style={{ background: s.color }} />
                    <span className="flex-1 text-[12.5px] text-[var(--fg2)]">{s.label}</span>
                    <span style={num} className="text-[12.5px] font-bold text-[var(--fg)]">{s.pctFmt}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Performance */}
          <section className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] p-6" style={{ boxShadow: "var(--shadow)" }}>
            <h2 className="mb-4 text-[17px] font-bold text-[var(--fg)]">Performance</h2>
            <div className="flex flex-col gap-[13px]">
              {perfBars.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="w-[74px] flex-none text-[12.5px] text-[var(--fg2)]">{b.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-[5px] bg-[var(--track)]">
                    <div className="h-full rounded-[5px]" style={{ width: `${b.width}%`, background: b.pos ? "var(--pos)" : "var(--neg)" }} />
                  </div>
                  <span style={num} className="w-[60px] text-right text-[12.5px] font-bold" >
                    <span style={{ color: b.pos ? "var(--pos)" : "var(--neg)" }}>{signPct(b.pct)}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Objectif */}
          <section className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] p-6" style={{ boxShadow: "var(--shadow)" }}>
            <h2 className="mb-1 text-[17px] font-bold text-[var(--fg)]">Objectif</h2>
            {data.goal ? (
              <>
                <span className="text-[12.5px] text-[var(--fg2)]">Cible {eur(data.goal)}</span>
                <div className="mt-[14px] flex items-center gap-[18px]">
                  <div className="relative h-24 w-24 flex-none">
                    <svg width="96" height="96" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--track)" strokeWidth="12" />
                      <circle cx="60" cy="60" r="52" fill="none" style={{ stroke: "var(--accent)" }} strokeWidth="12" strokeLinecap="round" strokeDasharray={ringDash} transform="rotate(-90 60 60)" />
                    </svg>
                    <div style={num} className="absolute inset-0 flex items-center justify-center text-[18px] font-bold text-[var(--fg)]">
                      {nf(goalPct, 1)} %
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-[11px]">
                    <div className="flex flex-col">
                      <span className="text-[11.5px] text-[var(--fg2)]">Reste à atteindre</span>
                      <span style={num} className="text-[17px] font-bold text-[var(--fg)]">{eur(data.goal - data.total)}</span>
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
                <div className="flex flex-col gap-1">
                  <span className="text-[11.5px] text-[var(--fg2)]">Frais annuels · {nf(data.fees.rate, 2)} %</span>
                  <span style={num} className="text-[17px] font-bold text-[var(--fg)]">{eur(data.fees.annual)}</span>
                </div>
              </div>
            )}
          </section>

          {/* Positions */}
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
                        <span
                          className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] text-[11px] font-bold text-white opacity-90"
                          style={{ background: allocColor(p.cls) }}
                        >
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
                      <span
                        style={{ ...num, color: p.day >= 0 ? "var(--pos)" : "var(--neg)", background: p.day >= 0 ? "var(--posbg)" : "var(--negbg)" }}
                        className="rounded-[7px] px-2 py-[3px] text-[12px] font-bold"
                      >
                        {signPct(p.day)}
                      </span>
                    </td>
                    <td style={num} className="px-6 py-[11px] text-right text-[var(--fg2)]">{nf(p.weight, 1)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Top mouvements */}
          <section className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] px-6 py-[22px]" style={{ boxShadow: "var(--shadow)" }}>
            <h2 className="mb-[14px] text-[17px] font-bold text-[var(--fg)]">Top mouvements</h2>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pos)]">Hausses</span>
            <div className="my-[9px] mb-4 flex flex-col gap-[9px]">
              {data.gainers.map((g) => (
                <div key={g.name} className="flex items-center justify-between text-[13px]">
                  <span className="text-[var(--fg)]">{g.name}</span>
                  <span style={num} className="font-bold text-[var(--pos)]">{signPct(g.pct)}</span>
                </div>
              ))}
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--neg)]">Baisses</span>
            <div className="mt-[9px] flex flex-col gap-[9px]">
              {data.losers.map((g) => (
                <div key={g.name} className="flex items-center justify-between text-[13px]">
                  <span className="text-[var(--fg)]">{g.name}</span>
                  <span style={num} className="font-bold text-[var(--neg)]">{signPct(g.pct)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Transactions */}
          <section className="col-span-12 rounded-[22px] border border-[var(--line)] bg-[var(--panel)] px-[26px] py-[22px]" style={{ boxShadow: "var(--shadow)" }}>
            <div className="mb-[14px] flex items-center justify-between">
              <h2 className="text-[17px] font-bold text-[var(--fg)]">Flux &amp; transactions récents</h2>
              <span className="cursor-pointer text-[12.5px] font-semibold text-[var(--accent)]">Voir l'historique</span>
            </div>
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
                    <span style={{ ...num, color: t.amount >= 0 ? "var(--pos)" : "var(--fg)" }} className="text-[16px] font-bold">
                      {signEur(t.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
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
            <Link
              href="/import"
              className="rounded-full px-3 py-[5px] text-[12px] font-semibold text-white"
              style={{ background: "linear-gradient(140deg, var(--accent), var(--accent2))" }}
            >
              Importer
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
