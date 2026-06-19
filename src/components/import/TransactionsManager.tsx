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
  sourceDocument: string | null;
  accountName: string;
  assetName: string;
  assetTicker: string;
};

export function TransactionsManager() {
  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ quantity: string; price: string; fees: string; date: string }>({
    quantity: "",
    price: "",
    fees: "",
    date: "",
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/transactions");
    if (res.ok) setRows(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

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

  if (rows === null) {
    return <p className="text-[13px] text-[var(--fg2)]">Chargement…</p>;
  }

  if (rows.length === 0) {
    return <p className="text-[13px] text-[var(--fg2)]">Aucune transaction enregistrée pour l'instant.</p>;
  }

  return (
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
                    <span className="font-semibold text-[var(--fg)]">{r.assetName}</span>
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
                          style={{ borderColor: "var(--line)", color: "var(--fg2)" }}
                        >
                          Modifier
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
  );
}
