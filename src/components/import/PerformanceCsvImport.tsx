"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Account = {
  id: string;
  name: string;
  type: string;
  broker: string | null;
};

type PerformanceCsvImportProps = {
  accounts: Account[];
};

export function PerformanceCsvImport({ accounts }: PerformanceCsvImportProps) {
  const router = useRouter();
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!selectedAccountId) return;
    setLoading(true);
    setFeedback(null);

    const formData = new FormData();
    formData.set("accountId", selectedAccountId);
    formData.set("file", file);

    try {
      const res = await fetch("/api/portfolio/snapshots", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ kind: "error", message: data.error ?? "Erreur lors de l'import" });
        return;
      }
      setFeedback({ kind: "ok", message: `${data.count} jours de valorisation importés.` });
      router.refresh();
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <select
        value={selectedAccountId}
        onChange={(e) => setSelectedAccountId(e.target.value)}
        className="rounded-[10px] border px-3 py-2 text-[13px] outline-none"
        style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        disabled={loading || !selectedAccountId}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        className="text-[12.5px] text-[var(--fg2)]"
      />

      {feedback && (
        <p className="text-[12px]" style={{ color: feedback.kind === "ok" ? "var(--pos)" : "var(--neg)" }}>
          {feedback.message}
        </p>
      )}
    </div>
  );
}
