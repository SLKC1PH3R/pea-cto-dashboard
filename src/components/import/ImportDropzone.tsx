"use client";

import { useState, useCallback, useRef } from "react";

type Account = {
  id: string;
  name: string;
  type: string;
  broker: string;
};

type ImportFileResult = {
  filename: string;
  status: "ok" | "warning" | "error";
  transactionsCreated: number;
  depositsCreated: number;
  unresolvedAssets: string[];
  message?: string;
};

type ImportDropzoneProps = {
  accounts: Account[];
};

export function ImportDropzone({ accounts }: ImportDropzoneProps) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<ImportFileResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const pdfFiles = Array.from(files).filter((f) => f.type === "application/pdf");
      if (pdfFiles.length === 0) {
        setResults([
          {
            filename: "—",
            status: "error",
            transactionsCreated: 0,
            depositsCreated: 0,
            unresolvedAssets: [],
            message: "Aucun fichier PDF détecté parmi les fichiers déposés.",
          },
        ]);
        return;
      }

      if (!selectedAccountId) {
        setResults([
          {
            filename: "—",
            status: "error",
            transactionsCreated: 0,
            depositsCreated: 0,
            unresolvedAssets: [],
            message: "Sélectionne d'abord un compte cible.",
          },
        ]);
        return;
      }

      setUploading(true);
      setResults(null);

      const formData = new FormData();
      formData.set("accountId", selectedAccountId);
      pdfFiles.forEach((f) => formData.append("files", f));

      try {
        const res = await fetch("/api/import/boursorama", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (!res.ok) {
          setResults([
            {
              filename: "—",
              status: "error",
              transactionsCreated: 0,
              depositsCreated: 0,
              unresolvedAssets: [],
              message: data.error ?? "Erreur lors de l'import",
            },
          ]);
        } else {
          setResults(data.results);
        }
      } catch {
        setResults([
          {
            filename: "—",
            status: "error",
            transactionsCreated: 0,
            depositsCreated: 0,
            unresolvedAssets: [],
            message: "Erreur réseau lors de l'envoi des fichiers",
          },
        ]);
      } finally {
        setUploading(false);
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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm text-[#6b5f48]">Compte cible</label>
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="w-full max-w-sm rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
        >
          {accounts.length === 0 && <option value="">Aucun compte — crée-en un d'abord</option>}
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.type} — {a.broker})
            </option>
          ))}
        </select>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-12 text-center transition ${
          dragOver
            ? "border-[#c87a4d] bg-[#f3ecdd]"
            : "border-[#d8cbb0] bg-[#fbf8f1] hover:bg-[#f3ecdd]"
        }`}
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
        <p className="text-sm font-medium text-[#2b2620]">
          Glisse-dépose tes confirmations PDF Boursorama ici
        </p>
        <p className="text-xs text-[#a8997d]">ou clique pour sélectionner plusieurs fichiers</p>
      </div>

      {uploading && (
        <p className="text-sm text-[#8a7a5f]">Import en cours…</p>
      )}

      {results && (
        <div className="flex flex-col gap-2">
          {results.map((r, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 text-sm ${
                r.status === "ok"
                  ? "border-green-200 bg-green-50"
                  : r.status === "warning"
                  ? "border-amber-200 bg-amber-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-[#2b2620]">{r.filename}</span>
                <span className="text-xs uppercase text-[#a8997d]">{r.status}</span>
              </div>
              <div className="mt-1 text-xs text-[#6b5f48]">
                {r.transactionsCreated} transaction(s) · {r.depositsCreated} dépôt(s) créé(s)
              </div>
              {r.message && <p className="mt-1 text-xs text-[#a14f3f]">{r.message}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
