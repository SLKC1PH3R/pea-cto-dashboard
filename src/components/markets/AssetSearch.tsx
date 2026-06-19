"use client";

import { useMemo, useRef, useState } from "react";
import { MARKET_CATALOG, type CatalogAsset } from "@/lib/markets/catalog";

type AssetSearchProps = {
  onSelect: (asset: CatalogAsset) => void;
  placeholder?: string;
  excludeTickers?: string[];
};

function rank(query: string, asset: CatalogAsset): number {
  const q = query.toUpperCase();
  const ticker = asset.ticker.toUpperCase();
  const name = asset.name.toUpperCase();
  if (ticker.startsWith(q)) return 0;
  if (name.startsWith(q)) return 1;
  if (ticker.includes(q)) return 2;
  if (name.includes(q)) return 3;
  return 4;
}

export function AssetSearch({ onSelect, placeholder, excludeTickers = [] }: AssetSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const excluded = new Set(excludeTickers.map((t) => t.toUpperCase()));
    return MARKET_CATALOG.filter(
      (a) => !excluded.has(a.ticker.toUpperCase()) && (a.ticker.toUpperCase().includes(q.toUpperCase()) || a.name.toUpperCase().includes(q.toUpperCase()))
    )
      .sort((a, b) => rank(q, a) - rank(q, b))
      .slice(0, 8);
  }, [query, excludeTickers]);

  function handleSelect(asset: CatalogAsset) {
    onSelect(asset);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder ?? "ex : META, NVIDIA, SP500…"}
        className="w-full rounded-[11px] border px-3 py-2 text-sm outline-none focus:ring-2"
        style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
      />
      {open && results.length > 0 && (
        <div
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-[12px] border"
          style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}
        >
          {results.map((a) => (
            <button
              key={a.ticker}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(a)}
              className="flex w-full items-center justify-between px-3 py-[9px] text-left hover:bg-[var(--panel2)]"
            >
              <div className="flex flex-col leading-[1.25]">
                <span className="text-[13px] font-semibold text-[var(--fg)]">{a.name}</span>
                <span className="text-[11px] text-[var(--fg3)]">{a.ticker} · {a.region}</span>
              </div>
              <span
                className="rounded-[7px] px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-wide"
                style={{
                  color: a.type === "ETF" ? "var(--accent2)" : "var(--pos)",
                  background: a.type === "ETF" ? "rgba(157,123,245,.14)" : "var(--posbg)",
                }}
              >
                {a.type === "ETF" ? "ETF" : "Action"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
