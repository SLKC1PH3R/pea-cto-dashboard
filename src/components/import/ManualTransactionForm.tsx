"use client";

import { useState } from "react";

type Account = {
  id: string;
  name: string;
  type: string;
  broker: string | null;
};

type ManualTransactionFormProps = {
  accounts: Account[];
};

const ASSET_TYPES = [
  { value: "ACTION", label: "Action" },
  { value: "ETF_DISTRIBUANT", label: "ETF distribuant" },
  { value: "ETF_CAPITALISANT", label: "ETF capitalisant" },
];

export function ManualTransactionForm({ accounts }: ManualTransactionFormProps) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [ticker, setTicker] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState("ACTION");
  const [currency, setCurrency] = useState("EUR");
  const [type, setType] = useState("BUY");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("0");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          ticker: ticker.trim(),
          assetName: assetName.trim(),
          assetType,
          currency,
          type,
          quantity: parseFloat(quantity),
          price: parseFloat(price),
          fees: parseFloat(fees || "0"),
          date,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFeedback({ type: "error", message: data.error ?? "Erreur lors de l'ajout" });
      } else {
        setFeedback({ type: "ok", message: "Transaction ajoutée avec succès." });
        setTicker("");
        setAssetName("");
        setQuantity("");
        setPrice("");
        setFees("0");
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
              {a.name} ({a.type}{a.broker ? ` — ${a.broker}` : ""})
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
            placeholder="ex: AAPL, CW8.PA"
            className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[#6b5f48]">Nom de l'actif</label>
          <input
            required
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
            placeholder="ex: Apple Inc."
            className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-[#6b5f48]">Type d'actif</label>
          <select
            value={assetType}
            onChange={(e) => setAssetType(e.target.value)}
            className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
          >
            {ASSET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-[#6b5f48]">Devise</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
          >
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-[#6b5f48]">Sens</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
          >
            <option value="BUY">Achat</option>
            <option value="SELL">Vente</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-[#6b5f48]">Date</label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-sm text-[#6b5f48]">Quantité</label>
          <input
            type="number"
            step="any"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[#6b5f48]">Prix unitaire</label>
          <input
            type="number"
            step="any"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[#6b5f48]">Frais</label>
          <input
            type="number"
            step="any"
            value={fees}
            onChange={(e) => setFees(e.target.value)}
            className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
          />
        </div>
      </div>

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
        {submitting ? "Ajout…" : "Ajouter la transaction"}
      </button>
    </form>
  );
}
