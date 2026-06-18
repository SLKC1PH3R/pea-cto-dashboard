"use client";

import { useState } from "react";

type Account = {
  id: string;
  name: string;
  type: string;
  broker: string;
};

type DcaRuleFormProps = {
  accounts: Account[];
};

export function DcaRuleForm({ accounts }: DcaRuleFormProps) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [ticker, setTicker] = useState("");
  const [assetName, setAssetName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("WEEKLY");
  const [firstExecution, setFirstExecution] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/dca-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          ticker: ticker.trim(),
          assetName: assetName.trim(),
          amount: parseFloat(amount),
          frequency,
          firstExecution,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFeedback({ type: "error", message: data.error ?? "Erreur lors de la création" });
      } else {
        setFeedback({
          type: "ok",
          message: `Plan créé — ${data.projectedCount} exécution(s) projetée(s) générée(s). Pense à ajuster les prix réels depuis le tableau des positions.`,
        });
        setTicker("");
        setAssetName("");
        setAmount("");
        setFirstExecution("");
      }
    } catch {
      setFeedback({ type: "error", message: "Erreur réseau" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-sm text-[#6b5f48]">Compte</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.type} — {a.broker})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-[#6b5f48]">Ticker</label>
          <input
            required
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="ex: PHAG.L"
            className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[#6b5f48]">Nom de l'actif</label>
          <input
            required
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
            placeholder="ex: Physical Silver"
            className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-sm text-[#6b5f48]">Montant / exécution</label>
          <input
            type="number"
            step="any"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="30"
            className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[#6b5f48]">Fréquence</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
          >
            <option value="WEEKLY">Hebdomadaire</option>
            <option value="BIWEEKLY">Bimensuelle</option>
            <option value="MONTHLY">Mensuelle</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-[#6b5f48]">1ère exécution</label>
          <input
            type="date"
            required
            value={firstExecution}
            onChange={(e) => setFirstExecution(e.target.value)}
            className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
          />
        </div>
      </div>

      <p className="text-xs text-[#a8997d]">
        Les exécutions passées seront générées automatiquement avec le cours actuel comme
        approximation (pas de confirmation d'exécution disponible chez Trade Republic). Tu pourras
        ajuster chaque ligne ensuite avec le prix réel.
      </p>

      {feedback && (
        <p className={`text-sm ${feedback.type === "ok" ? "text-[#5b7a4f]" : "text-[#a14f3f]"}`}>
          {feedback.message}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || accounts.length === 0}
        className="mt-1 rounded-md bg-[#c87a4d] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Création…" : "Créer le plan et générer les projections"}
      </button>
    </form>
  );
}
