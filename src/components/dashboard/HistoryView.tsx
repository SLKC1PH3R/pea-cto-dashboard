"use client";

import { useEffect, useMemo, useState } from "react";
import { eur, nf, signEur, signPct } from "@/components/dashboard/atelier-data";

interface HistoryPositionRow {
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

interface PositionsHistoryResult {
  date: string;
  requestedDate: string;
  totalValue: number;
  rows: HistoryPositionRow[];
  minDate: string | null;
  maxDate: string;
}

interface PortfolioValuePoint {
  date: string;
  totalValue: number;
  dayChangeAbs: number;
  dayChangePct: number;
}

interface PortfolioValueSeriesResult {
  points: PortfolioValuePoint[];
  minDate: string | null;
  maxDate: string;
}

type Granularity = "jour" | "semaine" | "mois" | "annee" | "perso";

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: "jour", label: "Jour" },
  { key: "semaine", label: "Semaine" },
  { key: "mois", label: "Mois" },
  { key: "annee", label: "Année" },
  { key: "perso", label: "Personnalisé" },
];

const num = { fontFamily: "var(--font-num, 'Space Grotesk', system-ui)" } as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function shiftMonth(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

function shiftYear(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() + delta);
  return d.toISOString().slice(0, 10);
}

/** Borne de début d'une fenêtre "semaine/mois/année" se terminant à `end` (incluse). */
function rangeStartFor(granularity: "semaine" | "mois" | "annee", end: string): string {
  if (granularity === "semaine") return shiftDay(end, -6);
  if (granularity === "mois") return shiftDay(shiftMonth(end, -1), 1);
  return shiftDay(shiftYear(end, -1), 1);
}

export function HistoryView() {
  const [granularity, setGranularity] = useState<Granularity>("jour");

  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [data, setData] = useState<PositionsHistoryResult | null>(null);

  const [rangeEnd, setRangeEnd] = useState(todayIso());
  const [customFrom, setCustomFrom] = useState(shiftDay(todayIso(), -6));
  const [customTo, setCustomTo] = useState(todayIso());
  const [seriesData, setSeriesData] = useState<PortfolioValueSeriesResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangeStart = useMemo(() => {
    if (granularity === "perso") return customFrom;
    if (granularity === "semaine" || granularity === "mois" || granularity === "annee") {
      return rangeStartFor(granularity, rangeEnd);
    }
    return null;
  }, [granularity, rangeEnd, customFrom]);
  const rangeEndEffective = granularity === "perso" ? customTo : rangeEnd;

  useEffect(() => {
    if (granularity !== "jour") return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/portfolio/history?date=${selectedDate}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erreur");
        if (!cancelled) setData(json);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [granularity, selectedDate]);

  useEffect(() => {
    if (granularity === "jour" || !rangeStart) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/portfolio/history/series?from=${rangeStart}&to=${rangeEndEffective}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erreur");
        if (!cancelled) setSeriesData(json);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [granularity, rangeStart, rangeEndEffective]);

  function openDay(date: string) {
    setGranularity("jour");
    setSelectedDate(date);
  }

  const minDate = (granularity === "jour" ? data?.minDate : seriesData?.minDate) ?? undefined;
  const maxDate = todayIso();
  const atMin = minDate !== undefined && selectedDate <= minDate;
  const atMax = selectedDate >= maxDate;
  const atRangeMax = rangeEndEffective >= maxDate;

  return (
    <section className="col-span-12 overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--panel)]" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-[10px] pt-[22px]">
        <div>
          <h2 className="text-[17px] font-bold text-[var(--fg)]">Historique journalier</h2>
          <p className="text-[12px] text-[var(--fg2)]">Détail des positions à la clôture d&apos;un jour donné</p>
        </div>
        <div className="flex gap-1 rounded-[11px] border border-[var(--line)] bg-[var(--panel2)] p-1">
          {GRANULARITIES.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGranularity(g.key)}
              className="rounded-[8px] px-3 py-[6px] text-[12px] font-semibold"
              style={{ background: granularity === g.key ? "var(--accent)" : "transparent", color: granularity === g.key ? "#fff" : "var(--fg2)" }}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-6 pb-[14px]">
        {granularity === "jour" && (
          <>
            <button
              type="button"
              disabled={atMin}
              onClick={() => setSelectedDate((d) => shiftDay(d, -1))}
              className="rounded-[8px] border px-2 py-[6px] text-[12px] font-semibold text-[var(--fg2)] disabled:opacity-40"
              style={{ borderColor: "var(--line)" }}
            >
              ←
            </button>
            <input
              type="date"
              value={selectedDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="rounded-[8px] border px-3 py-[6px] text-[12.5px]"
              style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
            />
            <button
              type="button"
              disabled={atMax}
              onClick={() => setSelectedDate((d) => shiftDay(d, 1))}
              className="rounded-[8px] border px-2 py-[6px] text-[12px] font-semibold text-[var(--fg2)] disabled:opacity-40"
              style={{ borderColor: "var(--line)" }}
            >
              →
            </button>
          </>
        )}

        {(granularity === "semaine" || granularity === "mois" || granularity === "annee") && (
          <>
            <button
              type="button"
              onClick={() =>
                setRangeEnd((d) => (granularity === "semaine" ? shiftDay(d, -7) : granularity === "mois" ? shiftMonth(d, -1) : shiftYear(d, -1)))
              }
              className="rounded-[8px] border px-2 py-[6px] text-[12px] font-semibold text-[var(--fg2)]"
              style={{ borderColor: "var(--line)" }}
            >
              ←
            </button>
            <span className="text-[12.5px] text-[var(--fg2)]">
              Du {rangeStart && new Date(rangeStart).toLocaleDateString("fr-FR")} au {new Date(rangeEndEffective).toLocaleDateString("fr-FR")}
            </span>
            <input
              type="date"
              value={rangeEnd}
              max={maxDate}
              onChange={(e) => e.target.value && setRangeEnd(e.target.value)}
              className="rounded-[8px] border px-3 py-[6px] text-[12.5px]"
              style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
            />
            <button
              type="button"
              disabled={atRangeMax}
              onClick={() =>
                setRangeEnd((d) => (granularity === "semaine" ? shiftDay(d, 7) : granularity === "mois" ? shiftMonth(d, 1) : shiftYear(d, 1)))
              }
              className="rounded-[8px] border px-2 py-[6px] text-[12px] font-semibold text-[var(--fg2)] disabled:opacity-40"
              style={{ borderColor: "var(--line)" }}
            >
              →
            </button>
          </>
        )}

        {granularity === "perso" && (
          <>
            <span className="text-[12px] text-[var(--fg2)]">Du</span>
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => e.target.value && setCustomFrom(e.target.value)}
              className="rounded-[8px] border px-3 py-[6px] text-[12.5px]"
              style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
            />
            <span className="text-[12px] text-[var(--fg2)]">au</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={maxDate}
              onChange={(e) => e.target.value && setCustomTo(e.target.value)}
              className="rounded-[8px] border px-3 py-[6px] text-[12.5px]"
              style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
            />
          </>
        )}
      </div>

      {granularity === "jour" && data && data.date !== data.requestedDate && (
        <p className="px-6 pb-2 text-[11.5px] text-[var(--fg3)]">
          Pas de cours pour le {new Date(data.requestedDate).toLocaleDateString("fr-FR")} (marché fermé ?) — repli sur le{" "}
          {new Date(data.date).toLocaleDateString("fr-FR")}.
        </p>
      )}

      {error && <p className="px-6 pb-4 text-[12.5px] text-[var(--neg)]">{error}</p>}

      {!error && loading && !data && !seriesData && <p className="px-6 pb-6 text-[13px] text-[var(--fg2)]">Chargement…</p>}

      {granularity === "jour" && !error && data && data.rows.length === 0 && (
        <p className="px-6 pb-6 text-[13px] text-[var(--fg2)]">Aucune position détenue à cette date.</p>
      )}

      {granularity === "jour" && !error && data && data.rows.length > 0 && (
        <table className="w-full text-[13px]" style={{ opacity: loading ? 0.5 : 1 }}>
          <thead>
            <tr className="border-y border-[var(--line)]">
              {["Actif", "Cours", "Valeur", "+/- jour", "Poids"].map((label, i) => (
                <th
                  key={label}
                  className={`py-[9px] text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)] ${i === 0 ? "px-6 text-left" : "px-[10px] text-right"}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((p) => (
              <tr key={p.ticker} className="border-b border-[var(--line)] hover:bg-[var(--panel2)]">
                <td className="px-6 py-[11px]">
                  <div className="flex flex-col leading-[1.25]">
                    <span className="font-bold text-[var(--fg)]">{p.name}</span>
                    <span className="text-[11px] text-[var(--fg3)]">{p.ticker} · {p.sector}</span>
                  </div>
                </td>
                <td style={num} className="px-[10px] py-[11px] text-right text-[var(--fg2)]">{eur(p.price, 2)}</td>
                <td style={num} className="px-[10px] py-[11px] text-right font-bold text-[var(--fg)]">{eur(p.value)}</td>
                <td className="px-[10px] py-[11px] text-right">
                  <div className="flex flex-col items-end">
                    <span style={{ ...num, color: p.dayChangeAbs >= 0 ? "var(--pos)" : "var(--neg)" }} className="font-semibold">
                      {signEur(p.dayChangeAbs)}
                    </span>
                    <span style={{ ...num, color: p.dayChangePct >= 0 ? "var(--pos)" : "var(--neg)" }} className="text-[11px]">
                      {signPct(p.dayChangePct)}
                    </span>
                  </div>
                </td>
                <td style={num} className="px-6 py-[11px] text-right text-[var(--fg2)]">{nf(p.weight, 1)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {granularity !== "jour" && !error && seriesData && seriesData.points.length === 0 && (
        <p className="px-6 pb-6 text-[13px] text-[var(--fg2)]">Aucune donnée sur cette période.</p>
      )}

      {granularity !== "jour" && !error && seriesData && seriesData.points.length > 0 && (
        <table className="w-full text-[13px]" style={{ opacity: loading ? 0.5 : 1 }}>
          <thead>
            <tr className="border-y border-[var(--line)]">
              {["Date", "Valeur totale", "+/- vs jour précédent"].map((label, i) => (
                <th
                  key={label}
                  className={`py-[9px] text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)] ${i === 0 ? "px-6 text-left" : "px-[10px] text-right"}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seriesData.points.map((p) => (
              <tr
                key={p.date}
                onClick={() => openDay(p.date)}
                className="cursor-pointer border-b border-[var(--line)] hover:bg-[var(--panel2)]"
              >
                <td className="px-6 py-[9px] text-[var(--fg)]">{new Date(p.date).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                <td style={num} className="px-[10px] py-[9px] text-right font-bold text-[var(--fg)]">{eur(p.totalValue)}</td>
                <td className="px-[10px] py-[9px] text-right">
                  <span style={{ ...num, color: p.dayChangeAbs >= 0 ? "var(--pos)" : "var(--neg)" }} className="font-semibold">
                    {signEur(p.dayChangeAbs)}
                  </span>
                  <span style={{ ...num, color: p.dayChangePct >= 0 ? "var(--pos)" : "var(--neg)" }} className="ml-2 text-[11px]">
                    {signPct(p.dayChangePct)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
