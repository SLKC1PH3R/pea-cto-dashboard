"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Account = {
  id: string;
  name: string;
  type: string;
  broker: string | null;
};

type AccountManagerProps = {
  accounts: Account[];
};

const ACCOUNT_TYPES = [
  { value: "PEA", label: "PEA" },
  { value: "CTO", label: "CTO" },
];

const BROKERS = [
  { value: "", label: "Aucun / autre" },
  { value: "BOURSORAMA", label: "Boursorama" },
  { value: "TRADE_REPUBLIC", label: "Trade Republic" },
];

export function AccountManager({ accounts }: AccountManagerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(accounts.length === 0);
  const [name, setName] = useState("");
  const [type, setType] = useState("PEA");
  const [broker, setBroker] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || type,
        type,
        broker: broker || null,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erreur lors de la création du compte");
      return;
    }

    setName("");
    setOpen(false);
    router.refresh();
  }

  return (
    <section
      className="rounded-[22px] border p-6"
      style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-[var(--fg)]">Mes comptes</h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-[11px] border px-[13px] py-[9px] text-[12.5px] font-semibold text-white"
          style={{ borderColor: "var(--line)", background: "linear-gradient(140deg, var(--accent), var(--accent2))" }}
        >
          {open ? "Annuler" : "+ Ajouter un compte"}
        </button>
      </div>

      {accounts.length === 0 && !open && (
        <p className="text-[13px] text-[var(--fg2)]">
          Tu n'as pas encore de compte. Clique sur « Ajouter un compte » pour créer ton premier PEA ou CTO.
        </p>
      )}

      {accounts.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {accounts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-[12px] border px-4 py-[10px]"
              style={{ borderColor: "var(--line)", background: "var(--panel2)" }}
            >
              <span className="text-[13px] font-semibold text-[var(--fg)]">{a.name}</span>
              <span className="text-[12px] text-[var(--fg3)]">
                {a.type}
                {a.broker ? ` — ${a.broker}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {open && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[12px] text-[var(--fg2)]">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none focus:ring-2"
                style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-[var(--fg2)]">Courtier</label>
              <select
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none focus:ring-2"
                style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
              >
                {BROKERS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-[var(--fg2)]">Nom (optionnel)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type}
                className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none focus:ring-2"
                style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
              />
            </div>
          </div>

          {error && <p className="text-[12.5px] text-[#e08a8a]">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="self-start rounded-[11px] px-4 py-[9px] text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(140deg, var(--accent), var(--accent2))" }}
          >
            {submitting ? "Création…" : "Créer le compte"}
          </button>
        </form>
      )}
    </section>
  );
}
