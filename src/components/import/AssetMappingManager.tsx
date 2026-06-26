"use client";

import { useEffect, useState } from "react";

type UnknownAssetRow = {
  id: string;
  rawName: string;
  isin: string | null;
  occurrences: number;
  lastSeenAt: string;
};

type CustomMappingRow = {
  id: string;
  rawName: string;
  ticker: string;
  isin: string | null;
  name: string;
  assetType: string;
  sector: string | null;
  region: string | null;
  currency: string;
};

const ASSET_TYPES = [
  { value: "ACTION", label: "Action" },
  { value: "ETF_DISTRIBUANT", label: "ETF distribuant" },
  { value: "ETF_CAPITALISANT", label: "ETF capitalisant" },
  { value: "CRYPTO", label: "Crypto" },
];

type DraftMapping = { ticker: string; name: string; assetType: string; sector: string; region: string; currency: string };

function emptyDraft(rawName: string, isin: string | null): DraftMapping {
  return { ticker: "", name: rawName, assetType: "ACTION", sector: "", region: "", currency: isin ? "" : "EUR" };
}

/**
 * Enrichissement de asset-mapping.ts (table statique) sans déploiement de
 * code : les noms d'actif que les imports Boursorama/Trade Republic n'ont
 * pas su résoudre (ni table statique, ni suggestion tradingview.com)
 * apparaissent ici. Les mapper une fois suffit — les imports suivants les
 * résolvent automatiquement (cf. resolveAssetWithCustom).
 */
export function AssetMappingManager() {
  const [unknown, setUnknown] = useState<UnknownAssetRow[] | null>(null);
  const [custom, setCustom] = useState<CustomMappingRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftMapping>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/asset-mappings");
    if (!res.ok) return;
    const data = await res.json();
    setUnknown(data.unknown);
    setCustom(data.custom);
  }

  useEffect(() => {
    load();
  }, []);

  function draftFor(row: UnknownAssetRow): DraftMapping {
    return drafts[row.id] ?? emptyDraft(row.rawName, row.isin);
  }

  function updateDraft(rowId: string, row: UnknownAssetRow, patch: Partial<DraftMapping>) {
    setDrafts((prev) => ({ ...prev, [rowId]: { ...draftFor(row), ...patch } }));
  }

  async function mapAsset(row: UnknownAssetRow) {
    const draft = draftFor(row);
    if (!draft.ticker.trim() || !draft.name.trim()) {
      setError("Ticker et nom requis.");
      return;
    }
    setBusyId(row.id);
    setError(null);
    const res = await fetch("/api/asset-mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawName: row.rawName,
        ticker: draft.ticker.trim().toUpperCase(),
        isin: row.isin,
        name: draft.name.trim(),
        assetType: draft.assetType,
        sector: draft.sector.trim() || null,
        region: draft.region.trim() || null,
        currency: draft.currency.trim() || "EUR",
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erreur lors de l'enregistrement");
      return;
    }
    await load();
  }

  async function dismiss(row: UnknownAssetRow) {
    setBusyId(row.id);
    await fetch(`/api/asset-mappings/${row.id}?type=unknown`, { method: "DELETE" });
    setBusyId(null);
    await load();
  }

  async function removeMapping(row: CustomMappingRow) {
    setBusyId(row.id);
    await fetch(`/api/asset-mappings/${row.id}?type=custom`, { method: "DELETE" });
    setBusyId(null);
    await load();
  }

  if (unknown === null) {
    return <p className="text-[13px] text-[var(--fg2)]">Chargement…</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="mb-1 text-[15px] font-bold text-[var(--fg)]">Actifs non reconnus</h3>
        <p className="mb-3 text-[12px] text-[var(--fg2)]">
          Noms rencontrés dans tes imports que ni la table statique ni tradingview.com n&apos;ont su résoudre — mappe-les une
          fois, les imports suivants les reconnaîtront automatiquement.
        </p>

        {unknown.length === 0 ? (
          <p className="text-[13px] text-[var(--fg2)]">Aucun actif non reconnu pour l&apos;instant.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {unknown.map((row) => {
              const draft = draftFor(row);
              return (
                <div key={row.id} className="rounded-[12px] border p-3" style={{ borderColor: "var(--line)", background: "var(--panel2)" }}>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <span className="text-[13px] font-semibold text-[var(--fg)]">{row.rawName}</span>
                      <span className="ml-2 text-[11px] text-[var(--fg3)]">
                        {row.isin ? `ISIN ${row.isin} · ` : ""}
                        vu {row.occurrences}×
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismiss(row)}
                      disabled={busyId === row.id}
                      className="text-[11px] font-semibold text-[var(--fg3)] hover:text-[var(--fg)]"
                    >
                      Ignorer
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    <input
                      value={draft.ticker}
                      onChange={(e) => updateDraft(row.id, row, { ticker: e.target.value })}
                      placeholder="Ticker (ex: AAPL)"
                      className="rounded-[8px] border px-2 py-[6px] text-[12px]"
                      style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--fg)" }}
                    />
                    <input
                      value={draft.name}
                      onChange={(e) => updateDraft(row.id, row, { name: e.target.value })}
                      placeholder="Nom"
                      className="rounded-[8px] border px-2 py-[6px] text-[12px]"
                      style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--fg)" }}
                    />
                    <select
                      value={draft.assetType}
                      onChange={(e) => updateDraft(row.id, row, { assetType: e.target.value })}
                      className="rounded-[8px] border px-2 py-[6px] text-[12px]"
                      style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--fg)" }}
                    >
                      {ASSET_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={draft.region}
                      onChange={(e) => updateDraft(row.id, row, { region: e.target.value })}
                      placeholder="Région"
                      className="rounded-[8px] border px-2 py-[6px] text-[12px]"
                      style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--fg)" }}
                    />
                    <input
                      value={draft.currency}
                      onChange={(e) => updateDraft(row.id, row, { currency: e.target.value })}
                      placeholder="Devise (EUR)"
                      className="rounded-[8px] border px-2 py-[6px] text-[12px]"
                      style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--fg)" }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => mapAsset(row)}
                    disabled={busyId === row.id}
                    className="mt-2 rounded-[8px] px-3 py-[6px] text-[12px] font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(140deg, var(--accent), var(--accent2))" }}
                  >
                    {busyId === row.id ? "Enregistrement…" : "Mapper"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="mt-2 text-[12px] text-[var(--neg)]">{error}</p>}
      </div>

      {custom && custom.length > 0 && (
        <div>
          <h3 className="mb-2 text-[15px] font-bold text-[var(--fg)]">Mappings personnalisés</h3>
          <div className="flex flex-col gap-2">
            {custom.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-[10px] border px-3 py-2" style={{ borderColor: "var(--line)", background: "var(--panel2)" }}>
                <span className="text-[12.5px] text-[var(--fg)]">
                  {row.rawName} → <span className="font-semibold">{row.ticker}</span> ({row.name})
                </span>
                <button
                  type="button"
                  onClick={() => removeMapping(row)}
                  disabled={busyId === row.id}
                  className="text-[11px] font-semibold text-[var(--neg)]"
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
