"use client";

import { useMemo, useState } from "react";
import { MARKET_CATALOG, type CatalogAsset } from "@/lib/markets/catalog";

type MarketsBrowserProps = {
  initialWatchlist: string[];
};

type TypeFilter = "ALL" | "ACTION" | "ETF";

function rank(query: string, asset: CatalogAsset): number {
  const q = query.toUpperCase();
  if (!q) return 0;
  const ticker = asset.ticker.toUpperCase();
  const name = asset.name.toUpperCase();
  if (ticker.startsWith(q)) return 0;
  if (name.startsWith(q)) return 1;
  if (ticker.includes(q)) return 2;
  if (name.includes(q)) return 3;
  return 4;
}

export function MarketsBrowser({ initialWatchlist }: MarketsBrowserProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [watchlist, setWatchlist] = useState<string[]>(initialWatchlist.map((t) => t.toUpperCase()));
  const [pending, setPending] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    return MARKET_CATALOG.filter((a) => {
      if (typeFilter !== "ALL" && a.type !== typeFilter) return false;
      if (!q) return true;
      return a.ticker.toUpperCase().includes(q.toUpperCase()) || a.name.toUpperCase().includes(q.toUpperCase());
    })
      .sort((a, b) => rank(q, a) - rank(q, b))
      .slice(0, 60);
  }, [query, typeFilter]);

  async function toggleWatch(ticker: string, name: string) {
    const upper = ticker.toUpperCase();
    const isWatched = watchlist.includes(upper);
    setPending(upper);

    if (isWatched) {
      await fetch(`/api/watchlist?ticker=${encodeURIComponent(upper)}`, { method: "DELETE" });
      setWatchlist((prev) => prev.filter((t) => t !== upper));
    } else {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: upper, name }),
      });
      setWatchlist((prev) => [...prev, upper]);
    }

    setPending(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ex : ME pour Meta, NV pour Nvidia, SP500…"
          className="flex-1 rounded-[11px] border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
        />
        <div className="flex gap-1 rounded-[11px] border border-[var(--line)] bg-[var(--panel2)] p-1">
          {([
            ["ALL", "Tout"],
            ["ACTION", "Actions"],
            ["ETF", "ETF"],
          ] as [TypeFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTypeFilter(key)}
              className="rounded-[8px] px-3 py-[6px] text-[12px] font-semibold"
              style={{ background: typeFilter === key ? "var(--accent)" : "transparent", color: typeFilter === key ? "#fff" : "var(--fg2)" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[22px] border" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--line)]">
              <th className="px-6 py-[9px] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)]">Actif</th>
              <th className="px-3 py-[9px] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)]">Région</th>
              <th className="px-3 py-[9px] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)]">Type</th>
              <th className="px-6 py-[9px] text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)]"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const watched = watchlist.includes(a.ticker.toUpperCase());
              return (
                <tr key={a.ticker} className="border-b border-[var(--line)] hover:bg-[var(--panel2)]">
                  <td className="px-6 py-[10px]">
                    <div className="flex flex-col leading-[1.25]">
                      <span className="font-bold text-[var(--fg)]">{a.name}</span>
                      <span className="text-[11px] text-[var(--fg3)]">{a.ticker}{a.sector ? ` · ${a.sector}` : ""}</span>
                    </div>
                  </td>
                  <td className="px-3 py-[10px] text-[var(--fg2)]">{a.region}</td>
                  <td className="px-3 py-[10px]">
                    <span
                      className="rounded-[7px] px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-wide"
                      style={{
                        color: a.type === "ETF" ? "var(--accent2)" : "var(--pos)",
                        background: a.type === "ETF" ? "rgba(157,123,245,.14)" : "var(--posbg)",
                      }}
                    >
                      {a.type === "ETF" ? "ETF" : "Action"}
                    </span>
                  </td>
                  <td className="px-6 py-[10px] text-right">
                    <button
                      type="button"
                      disabled={pending === a.ticker.toUpperCase()}
                      onClick={() => toggleWatch(a.ticker, a.name)}
                      className="rounded-[9px] border px-3 py-[6px] text-[12px] font-semibold disabled:opacity-50"
                      style={
                        watched
                          ? { borderColor: "var(--accent)", background: "rgba(157,123,245,.14)", color: "var(--accent2)" }
                          : { borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg2)" }
                      }
                    >
                      {watched ? "✓ Suivi" : "+ Suivre"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="px-6 py-8 text-center text-[13px] text-[var(--fg2)]">Aucun résultat pour cette recherche.</p>
        )}
      </div>
    </div>
  );
}
