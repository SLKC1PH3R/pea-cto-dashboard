"use client";

import { useEffect, useState } from "react";

type TransactionRow = {
  id: string;
  date: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  fees: number;
  note: string | null;
  status: "PROJECTED" | "CONFIRMED";
  sourceDocument: string | null;
  accountName: string;
  assetName: string;
  assetTicker: string;
};

type DepositRow = {
  id: string;
  date: string;
  amount: number;
  note: string | null;
  accountName: string;
};

type Tab = "transactions" | "depots";

export function TransactionsManager() {
  const [tab, setTab] = useState<Tab>("transactions");
  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ quantity: string; price: string; fees: string; date: string }>({
    quantity: "",
    price: "",
    fees: "",
    date: "",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const [depRows, setDepRows] = useState<DepositRow[] | null>(null);
  const [editingDepId, setEditingDepId] = useState<string | null>(null);
  const [editDepValues, setEditDepValues] = useState<{ amount: string; date: string }>({ amount: "", date: "" });
  const [busyDepId, setBusyDepId] = useState<string | null>(null);
  const [deletingAllDep, setDeletingAllDep] = useState(false);

  async function load() {
    const res = await fetch("/api/transactions");
    if (!res.ok) return;
    const data: TransactionRow[] = await res.json();
    setRows(data);

    const tickers = [...new Set(data.filter((r) => r.type === "BUY").map((r) => r.assetTicker))];
    if (tickers.length > 0) {
      const qRes = await fetch(`/api/quotes?tickers=${encodeURIComponent(tickers.join(","))}`);
      if (qRes.ok) {
        const qData = await qRes.json();
        setQuotes(Object.fromEntries(Object.entries(qData).map(([t, q]) => [t, (q as { c: number }).c])));
      }
    }
  }

  async function loadDeposits() {
    const res = await fetch("/api/deposits");
    if (!res.ok) return;
    setDepRows(await res.json());
  }

  useEffect(() => {
    load();
    loadDeposits();
  }, []);

  function startEditDep(row: DepositRow) {
    setEditingDepId(row.id);
    setEditDepValues({ amount: String(row.amount), date: row.date });
  }

  async function saveEditDep(id: string) {
    setBusyDepId(id);
    await fetch(`/api/deposits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: parseFloat(editDepValues.amount), date: editDepValues.date }),
    });
    setEditingDepId(null);
    setBusyDepId(null);
    loadDeposits();
  }

  async function handleDeleteDep(id: string) {
    setBusyDepId(id);
    await fetch(`/api/deposits/${id}`, { method: "DELETE" });
    setBusyDepId(null);
    loadDeposits();
  }

  async function handleDeleteAllDeposits() {
    if (!depRows || depRows.length === 0) return;
    if (!window.confirm(`Supprimer les ${depRows.length} dépôt(s) listé(s) ? Cette action est irréversible.`)) return;
    setDeletingAllDep(true);
    await Promise.all(depRows.map((r) => fetch(`/api/deposits/${r.id}`, { method: "DELETE" })));
    setDeletingAllDep(false);
    loadDeposits();
  }

  function daysSince(dateStr: string): number {
    return Math.max(0, Math.round((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
  }

  function startEdit(row: TransactionRow) {
    setEditingId(row.id);
    setEditValues({ quantity: String(row.quantity), price: String(row.price), fees: String(row.fees), date: row.date });
  }

  async function saveEdit(id: string) {
    setBusyId(id);
    await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quantity: parseFloat(editValues.quantity),
        price: parseFloat(editValues.price),
        fees: parseFloat(editValues.fees || "0"),
        date: editValues.date,
        // Modifier une ligne (notamment une projection DCA, pour y mettre le
        // prix/quantité réel) vaut validation — elle passe en CONFIRMED.
        status: "CONFIRMED",
      }),
    });
    setEditingId(null);
    setBusyId(null);
    load();
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    setBusyId(null);
    load();
  }

  async function handleDeleteAll() {
    if (!rows || rows.length === 0) return;
    if (!window.confirm(`Supprimer les ${rows.length} transaction(s) listée(s) ? Cette action est irréversible.`)) return;
    setDeletingAll(true);
    await Promise.all(rows.map((r) => fetch(`/api/transactions/${r.id}`, { method: "DELETE" })));
    setDeletingAll(false);
    load();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 rounded-[11px] border border-[var(--line)] bg-[var(--panel2)] p-1" style={{ width: "fit-content" }}>
          {([
            ["transactions", "Transactions"],
            ["depots", "Dépôts"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="rounded-[8px] px-3 py-[6px] text-[12.5px] font-semibold"
              style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--fg2)" }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "transactions" && rows && rows.length > 0 && (
          <button
            type="button"
            disabled={deletingAll}
            onClick={handleDeleteAll}
            className="rounded-[9px] border px-3 py-[6px] text-[12px] font-semibold disabled:opacity-50"
            style={{ borderColor: "var(--neg)", color: "var(--neg)" }}
          >
            {deletingAll ? "Suppression…" : `Tout supprimer (${rows.length})`}
          </button>
        )}
        {tab === "depots" && depRows && depRows.length > 0 && (
          <button
            type="button"
            disabled={deletingAllDep}
            onClick={handleDeleteAllDeposits}
            className="rounded-[9px] border px-3 py-[6px] text-[12px] font-semibold disabled:opacity-50"
            style={{ borderColor: "var(--neg)", color: "var(--neg)" }}
          >
            {deletingAllDep ? "Suppression…" : `Tout supprimer (${depRows.length})`}
          </button>
        )}
      </div>

      {tab === "transactions" ? (
        rows === null ? (
          <p className="text-[13px] text-[var(--fg2)]">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-[var(--fg2)]">Aucune transaction enregistrée pour l'instant.</p>
        ) : (
    <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: "var(--line)" }}>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b" style={{ borderColor: "var(--line)" }}>
            <th className="px-3 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Compte</th>
            <th className="px-2 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Actif</th>
            <th className="px-2 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Sens</th>
            <th className="px-2 py-2 text-right text-[11px] uppercase text-[var(--fg3)]">Qté</th>
            <th className="px-2 py-2 text-right text-[11px] uppercase text-[var(--fg3)]">Prix</th>
            <th className="px-2 py-2 text-right text-[11px] uppercase text-[var(--fg3)]">Frais</th>
            <th className="px-2 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Date</th>
            <th className="px-2 py-2 text-right text-[11px] uppercase text-[var(--fg3)]">P&amp;L depuis l&apos;achat</th>
            <th className="px-3 py-2 text-right text-[11px] uppercase text-[var(--fg3)]"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const editing = editingId === r.id;
            return (
              <tr key={r.id} className="border-b" style={{ borderColor: "var(--line)" }}>
                <td className="px-3 py-2 text-[var(--fg2)]">{r.accountName}</td>
                <td className="px-2 py-2">
                  <div className="flex flex-col leading-[1.2]">
                    <div className="flex items-center gap-[6px]">
                      <span className="font-semibold text-[var(--fg)]">{r.assetName}</span>
                      {r.status === "PROJECTED" && (
                        <span
                          className="rounded-[5px] px-[6px] py-[1px] text-[10px] font-semibold uppercase"
                          style={{ background: "var(--accent2)", color: "#fff", opacity: 0.85 }}
                        >
                          Projection DCA
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--fg3)]">{r.assetTicker}{r.sourceDocument ? " · PDF" : ""}</span>
                  </div>
                </td>
                <td className="px-2 py-2 text-[var(--fg2)]">{r.type === "BUY" ? "Achat" : "Vente"}</td>
                <td className="px-2 py-2 text-right">
                  {editing ? (
                    <input
                      type="number"
                      step="any"
                      value={editValues.quantity}
                      onChange={(e) => setEditValues((v) => ({ ...v, quantity: e.target.value }))}
                      className="w-20 rounded-[6px] border px-2 py-1 text-right text-[12px] outline-none"
                      style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                    />
                  ) : (
                    <span className="text-[var(--fg2)]">{r.quantity}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  {editing ? (
                    <input
                      type="number"
                      step="any"
                      value={editValues.price}
                      onChange={(e) => setEditValues((v) => ({ ...v, price: e.target.value }))}
                      className="w-20 rounded-[6px] border px-2 py-1 text-right text-[12px] outline-none"
                      style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                    />
                  ) : (
                    <span className="text-[var(--fg2)]">{r.price.toLocaleString("fr-FR")} €</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  {editing ? (
                    <input
                      type="number"
                      step="any"
                      value={editValues.fees}
                      onChange={(e) => setEditValues((v) => ({ ...v, fees: e.target.value }))}
                      className="w-16 rounded-[6px] border px-2 py-1 text-right text-[12px] outline-none"
                      style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                    />
                  ) : (
                    <span className="text-[var(--fg2)]">{r.fees.toLocaleString("fr-FR")} €</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {editing ? (
                    <input
                      type="date"
                      value={editValues.date}
                      onChange={(e) => setEditValues((v) => ({ ...v, date: e.target.value }))}
                      className="rounded-[6px] border px-2 py-1 text-[12px] outline-none"
                      style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                    />
                  ) : (
                    <span className="text-[var(--fg2)]">{r.date}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  {(() => {
                    if (r.type !== "BUY") return <span className="text-[var(--fg3)]">—</span>;
                    const current = quotes[r.assetTicker];
                    if (current === undefined) return <span className="text-[var(--fg3)]">—</span>;
                    const pl = (current - r.price) * r.quantity;
                    const plPct = r.price > 0 ? (current / r.price - 1) * 100 : 0;
                    return (
                      <div className="flex flex-col items-end leading-[1.2]">
                        <span style={{ color: pl >= 0 ? "var(--pos)" : "var(--neg)" }} className="font-bold">
                          {pl >= 0 ? "+" : "−"}{Math.abs(pl).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} € ({plPct >= 0 ? "+" : "−"}{Math.abs(plPct).toFixed(1)} %)
                        </span>
                        <span className="text-[10.5px] text-[var(--fg3)]">en {daysSince(r.date)} j</span>
                      </div>
                    );
                  })()}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    {editing ? (
                      <>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => saveEdit(r.id)}
                          className="rounded-[7px] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                          style={{ background: "var(--accent)" }}
                        >
                          Enregistrer
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-[7px] border px-2 py-1 text-[11px]"
                          style={{ borderColor: "var(--line)", color: "var(--fg2)" }}
                        >
                          Annuler
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="rounded-[7px] border px-2 py-1 text-[11px]"
                          style={
                            r.status === "PROJECTED"
                              ? { borderColor: "var(--accent2)", color: "var(--accent2)" }
                              : { borderColor: "var(--line)", color: "var(--fg2)" }
                          }
                        >
                          {r.status === "PROJECTED" ? "Confirmer" : "Modifier"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => handleDelete(r.id)}
                          className="rounded-[7px] border px-2 py-1 text-[11px] disabled:opacity-50"
                          style={{ borderColor: "var(--neg)", color: "var(--neg)" }}
                        >
                          Supprimer
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
        )
      ) : depRows === null ? (
        <p className="text-[13px] text-[var(--fg2)]">Chargement…</p>
      ) : depRows.length === 0 ? (
        <p className="text-[13px] text-[var(--fg2)]">Aucun dépôt enregistré pour l'instant.</p>
      ) : (
        <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: "var(--line)" }}>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--line)" }}>
                <th className="px-3 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Compte</th>
                <th className="px-2 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Libellé</th>
                <th className="px-2 py-2 text-right text-[11px] uppercase text-[var(--fg3)]">Montant</th>
                <th className="px-2 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Date</th>
                <th className="px-3 py-2 text-right text-[11px] uppercase text-[var(--fg3)]"></th>
              </tr>
            </thead>
            <tbody>
              {depRows.map((r) => {
                const editing = editingDepId === r.id;
                return (
                  <tr key={r.id} className="border-b" style={{ borderColor: "var(--line)" }}>
                    <td className="px-3 py-2 text-[var(--fg2)]">{r.accountName}</td>
                    <td className="px-2 py-2 text-[var(--fg)]">{r.note ?? "Versement"}</td>
                    <td className="px-2 py-2 text-right">
                      {editing ? (
                        <input
                          type="number"
                          step="any"
                          value={editDepValues.amount}
                          onChange={(e) => setEditDepValues((v) => ({ ...v, amount: e.target.value }))}
                          className="w-24 rounded-[6px] border px-2 py-1 text-right text-[12px] outline-none"
                          style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                        />
                      ) : (
                        <span className="text-[var(--fg2)]">{r.amount.toLocaleString("fr-FR")} €</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {editing ? (
                        <input
                          type="date"
                          value={editDepValues.date}
                          onChange={(e) => setEditDepValues((v) => ({ ...v, date: e.target.value }))}
                          className="rounded-[6px] border px-2 py-1 text-[12px] outline-none"
                          style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                        />
                      ) : (
                        <span className="text-[var(--fg2)]">{r.date}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {editing ? (
                          <>
                            <button
                              type="button"
                              disabled={busyDepId === r.id}
                              onClick={() => saveEditDep(r.id)}
                              className="rounded-[7px] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                              style={{ background: "var(--accent)" }}
                            >
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDepId(null)}
                              className="rounded-[7px] border px-2 py-1 text-[11px]"
                              style={{ borderColor: "var(--line)", color: "var(--fg2)" }}
                            >
                              Annuler
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditDep(r)}
                              className="rounded-[7px] border px-2 py-1 text-[11px]"
                              style={{ borderColor: "var(--line)", color: "var(--fg2)" }}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              disabled={busyDepId === r.id}
                              onClick={() => handleDeleteDep(r.id)}
                              className="rounded-[7px] border px-2 py-1 text-[11px] disabled:opacity-50"
                              style={{ borderColor: "var(--neg)", color: "var(--neg)" }}
                            >
                              Supprimer
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
