"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

type Account = {
  id: string;
  name: string;
  type: string;
  broker: string | null;
};

type PreviewTransaction = {
  date: string;
  operationLabel: string;
  assetName: string;
  isin: string | null;
  reference: string | null;
  ticker: string | null;
  resolvedName: string | null;
  quantity: number;
  amount: number;
  type: "BUY" | "SELL";
  suggested: boolean;
  duplicate: boolean;
};

type PreviewDeposit = {
  date: string;
  label: string;
  amount: number;
  duplicate: boolean;
};

type PreviewFileResult = {
  filename: string;
  status: "ok" | "warning" | "error";
  message?: string;
  alreadyImported: boolean;
  transactions: PreviewTransaction[];
  deposits: PreviewDeposit[];
};

// État éditable d'une ligne de transaction côté preview, avant confirmation.
type EditableTx = PreviewTransaction & { filename: string; included: boolean; key: string };
type EditableDep = PreviewDeposit & { filename: string; included: boolean; key: string };

type ImportDropzoneProps = {
  accounts: Account[];
};

export function ImportDropzone({ accounts }: ImportDropzoneProps) {
  const router = useRouter();
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileErrors, setFileErrors] = useState<{ filename: string; message: string }[]>([]);
  const [txRows, setTxRows] = useState<EditableTx[]>([]);
  const [depRows, setDepRows] = useState<EditableDep[]>([]);
  const [confirmFeedback, setConfirmFeedback] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const pdfFiles = Array.from(files).filter((f) => f.type === "application/pdf");
      if (pdfFiles.length === 0 || !selectedAccountId) return;

      setLoading(true);
      setConfirmFeedback(null);
      setFileErrors([]);
      setTxRows([]);
      setDepRows([]);

      const formData = new FormData();
      formData.set("accountId", selectedAccountId);
      pdfFiles.forEach((f) => formData.append("files", f));

      try {
        const res = await fetch("/api/import/boursorama", { method: "POST", body: formData });
        const data = await res.json();

        if (!res.ok) {
          setFileErrors([{ filename: "—", message: data.error ?? "Erreur lors du parsing" }]);
          return;
        }

        const results: PreviewFileResult[] = data.results;
        const newTxRows: EditableTx[] = [];
        const newDepRows: EditableDep[] = [];
        const errors: { filename: string; message: string }[] = [];

        results.forEach((r, fi) => {
          if (r.status === "error" || r.message) {
            errors.push({ filename: r.filename, message: r.message ?? "" });
          }
          r.transactions.forEach((t, ti) => {
            newTxRows.push({
              ...t,
              filename: r.filename,
              included: !!t.ticker && !r.alreadyImported && !t.duplicate,
              key: `${fi}-${ti}`,
            });
          });
          r.deposits.forEach((d, di) => {
            newDepRows.push({
              ...d,
              filename: r.filename,
              included: !r.alreadyImported && !d.duplicate,
              key: `${fi}-d${di}`,
            });
          });
        });

        setFileErrors(errors);
        setTxRows(newTxRows);
        setDepRows(newDepRows);
      } catch {
        setFileErrors([{ filename: "—", message: "Erreur réseau lors de l'envoi des fichiers" }]);
      } finally {
        setLoading(false);
      }
    },
    [selectedAccountId]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function updateTxRow(key: string, patch: Partial<EditableTx>) {
    setTxRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function updateDepRow(key: string, patch: Partial<EditableDep>) {
    setDepRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleConfirm() {
    setConfirming(true);
    setConfirmFeedback(null);

    const transactions = txRows.filter((r) => r.included && r.ticker);
    const deposits = depRows.filter((r) => r.included);

    try {
      const res = await fetch("/api/import/boursorama/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selectedAccountId, transactions, deposits }),
      });
      const data = await res.json();

      if (!res.ok) {
        setConfirmFeedback(data.error ?? "Erreur lors de la confirmation");
      } else {
        setConfirmFeedback(
          `${data.transactionsCreated} transaction(s) et ${data.depositsCreated} dépôt(s) ajoutés.` +
            (data.errors?.length ? ` ${data.errors.length} ligne(s) ignorée(s).` : "")
        );
        setTxRows([]);
        setDepRows([]);
        router.refresh();
      }
    } catch {
      setConfirmFeedback("Erreur réseau lors de la confirmation");
    } finally {
      setConfirming(false);
    }
  }

  const hasPreview = txRows.length > 0 || depRows.length > 0;
  const includedCount = txRows.filter((r) => r.included).length + depRows.filter((r) => r.included).length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm text-[var(--fg2)]">Compte cible</label>
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="w-full max-w-sm rounded-[10px] border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
        >
          {accounts.length === 0 && <option value="">Aucun compte — crée-en un d'abord</option>}
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.type}{a.broker ? ` — ${a.broker}` : ""})
            </option>
          ))}
        </select>
      </div>

      {!hasPreview && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-12 text-center transition"
          style={{
            borderColor: dragOver ? "var(--accent)" : "var(--line)",
            background: dragOver ? "var(--panel2)" : "var(--bg2)",
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <span className="text-3xl">📄</span>
          <p className="text-sm font-medium text-[var(--fg)]">Glisse-dépose tes confirmations PDF Boursorama ici</p>
          <p className="text-xs text-[var(--fg3)]">ou clique pour sélectionner plusieurs fichiers</p>
        </div>
      )}

      {loading && <p className="text-sm text-[var(--fg2)]">Analyse des PDF en cours…</p>}

      {fileErrors.length > 0 && (
        <div className="flex flex-col gap-2">
          {fileErrors.map((e, i) => (
            <div key={i} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--neg)", background: "var(--negbg)" }}>
              <span className="font-medium text-[var(--fg)]">{e.filename}</span>
              <p className="mt-1 text-xs" style={{ color: "var(--neg)" }}>{e.message}</p>
            </div>
          ))}
        </div>
      )}

      {hasPreview && (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-[var(--fg2)]">
            Vérifie les lignes ci-dessous avant de confirmer — décoche ou édite ce qui ne va pas, rien n'est encore enregistré.
          </p>

          {txRows.length > 0 && (
            <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: "var(--line)" }}>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--line)" }}>
                    <th className="w-8 px-3 py-2"></th>
                    <th className="px-2 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Date</th>
                    <th className="px-2 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Actif</th>
                    <th className="px-2 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Ticker</th>
                    <th className="px-2 py-2 text-right text-[11px] uppercase text-[var(--fg3)]">Qté</th>
                    <th className="px-2 py-2 text-right text-[11px] uppercase text-[var(--fg3)]">Montant</th>
                    <th className="px-2 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Sens</th>
                  </tr>
                </thead>
                <tbody>
                  {txRows.map((r) => (
                    <tr key={r.key} className="border-b" style={{ borderColor: "var(--line)" }}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={r.included} onChange={(e) => updateTxRow(r.key, { included: e.target.checked })} />
                      </td>
                      <td className="px-2 py-2 text-[var(--fg2)]">
                        {new Date(r.date).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-2 py-2 text-[var(--fg)]">{r.resolvedName ?? r.assetName}</td>
                      <td className="px-2 py-2">
                        <input
                          value={r.ticker ?? ""}
                          onChange={(e) => updateTxRow(r.key, { ticker: e.target.value.toUpperCase(), suggested: false })}
                          placeholder="ticker manquant"
                          className="w-24 rounded-[6px] border px-2 py-1 text-[12px] outline-none"
                          style={{
                            borderColor: !r.ticker ? "var(--neg)" : r.suggested ? "var(--accent2)" : "var(--line)",
                            background: "var(--panel2)",
                            color: "var(--fg)",
                          }}
                        />
                        {r.suggested && (
                          <div className="mt-[3px] text-[10px]" style={{ color: "var(--accent2)" }}>
                            suggestion auto · à vérifier
                          </div>
                        )}
                        {r.duplicate && (
                          <div className="mt-[3px] text-[10px]" style={{ color: "var(--neg)" }}>
                            doublon probable · déjà importé
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number"
                          step="any"
                          value={r.quantity}
                          onChange={(e) => updateTxRow(r.key, { quantity: parseFloat(e.target.value) })}
                          className="w-20 rounded-[6px] border px-2 py-1 text-right text-[12px] outline-none"
                          style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number"
                          step="any"
                          value={r.amount}
                          onChange={(e) => updateTxRow(r.key, { amount: parseFloat(e.target.value) })}
                          className="w-24 rounded-[6px] border px-2 py-1 text-right text-[12px] outline-none"
                          style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
                        />
                      </td>
                      <td className="px-2 py-2 text-[var(--fg2)]">{r.type === "BUY" ? "Achat" : "Vente"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {depRows.length > 0 && (
            <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: "var(--line)" }}>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--line)" }}>
                    <th className="w-8 px-3 py-2"></th>
                    <th className="px-2 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Date</th>
                    <th className="px-2 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Libellé</th>
                    <th className="px-2 py-2 text-right text-[11px] uppercase text-[var(--fg3)]">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {depRows.map((r) => (
                    <tr key={r.key} className="border-b" style={{ borderColor: "var(--line)" }}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={r.included} onChange={(e) => updateDepRow(r.key, { included: e.target.checked })} />
                      </td>
                      <td className="px-2 py-2 text-[var(--fg2)]">{r.date}</td>
                      <td className="px-2 py-2 text-[var(--fg)]">
                        {r.label}
                        {r.duplicate && (
                          <div className="mt-[3px] text-[10px]" style={{ color: "var(--neg)" }}>
                            doublon probable · déjà importé
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-[var(--fg2)]">{r.amount.toLocaleString("fr-FR")} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={confirming || includedCount === 0}
              onClick={handleConfirm}
              className="rounded-[11px] px-4 py-[9px] text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(140deg, var(--accent), var(--accent2))" }}
            >
              {confirming ? "Confirmation…" : `Confirmer l'import (${includedCount} ligne${includedCount > 1 ? "s" : ""})`}
            </button>
            <button
              type="button"
              onClick={() => {
                setTxRows([]);
                setDepRows([]);
                setFileErrors([]);
              }}
              className="rounded-[11px] border px-4 py-[9px] text-[13px] font-medium text-[var(--fg2)]"
              style={{ borderColor: "var(--line)" }}
            >
              Annuler
            </button>
          </div>

          {confirmFeedback && <p className="text-[12.5px]" style={{ color: "var(--pos)" }}>{confirmFeedback}</p>}
        </div>
      )}
    </div>
  );
}
