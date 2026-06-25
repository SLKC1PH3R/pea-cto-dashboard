"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ImportResult = {
  transactionsCreated: number;
  depositsCreated: number;
  feesCreated: number;
  skipped: number;
  warnings: string[];
  errors: string[];
};

/**
 * Import direct du CSV "Transactions" Trade Republic — pas d'étape
 * d'aperçu comme pour Boursorama (cf. /api/import/trade-republic) :
 * l'import est idempotent (transaction_id), réimporter le même fichier ne
 * crée jamais de doublon, donc rien à valider ligne par ligne avant coup.
 */
export function TRCsvImport() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setResult(null);
      setError(null);

      const formData = new FormData();
      formData.set("file", file);

      try {
        const res = await fetch("/api/import/trade-republic", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Erreur lors de l'import");
        } else {
          setResult(data);
          router.refresh();
        }
      } catch {
        setError("Erreur réseau lors de l'envoi du fichier");
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-[14px] font-bold text-[var(--fg)]">Trade Republic (export CSV)</h3>
        <p className="text-[12px] text-[var(--fg2)]">
          Export "Transactions" depuis l'appli Trade Republic — le compte Trade Republic est créé automatiquement si besoin,
          et réimporter le même fichier ne duplique rien.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition"
        style={{
          borderColor: dragOver ? "var(--accent)" : "var(--line)",
          background: dragOver ? "var(--panel2)" : "var(--bg2)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <span className="text-2xl">📄</span>
        <p className="text-sm font-medium text-[var(--fg)]">Glisse-dépose ton export CSV Trade Republic ici</p>
        <p className="text-xs text-[var(--fg3)]">ou clique pour sélectionner le fichier</p>
      </div>

      {loading && <p className="text-[13px] text-[var(--fg2)]">Import en cours…</p>}

      {error && (
        <div className="rounded-lg border p-3 text-[13px]" style={{ borderColor: "var(--neg)", background: "var(--negbg)" }}>
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-[12.5px]" style={{ borderColor: "var(--line)", background: "var(--panel2)" }}>
          <p style={{ color: "var(--pos)" }}>
            {result.transactionsCreated} transaction(s), {result.depositsCreated} dépôt(s) et {result.feesCreated} frais importés
            {result.skipped > 0 ? ` (${result.skipped} déjà connus, ignorés)` : ""}.
          </p>
          {result.warnings.map((w, i) => (
            <p key={i} className="text-[var(--fg2)]">⚠️ {w}</p>
          ))}
          {result.errors.map((e, i) => (
            <p key={i} style={{ color: "var(--neg)" }}>{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}
