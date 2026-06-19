"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type AccountType = "PEA" | "CTO";

const ACCOUNT_OPTIONS: { value: AccountType; label: string; description: string }[] = [
  { value: "PEA", label: "PEA", description: "Plan d'épargne en actions" },
  { value: "CTO", label: "CTO", description: "Compte-titres ordinaire" },
];

export function OnboardingForm() {
  const router = useRouter();
  const { update } = useSession();

  const [name, setName] = useState("");
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [tickerInput, setTickerInput] = useState("");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [hasGoal, setHasGoal] = useState(false);
  const [goalAmount, setGoalAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleAccountType(type: AccountType) {
    setAccountTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  function addTicker() {
    const value = tickerInput.trim().toUpperCase();
    if (!value || watchlist.includes(value)) {
      setTickerInput("");
      return;
    }
    setWatchlist((prev) => [...prev, value]);
    setTickerInput("");
  }

  function handleTickerKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTicker();
    }
  }

  function removeTicker(value: string) {
    setWatchlist((prev) => prev.filter((t) => t !== value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        accountTypes,
        watchlist,
        goalAmount: hasGoal ? Number(goalAmount) : null,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Une erreur est survenue, réessaie.");
      return;
    }

    // Rafraîchit le JWT (la session est en stratégie JWT, donc le flag
    // `onboarded` mis à jour côté base ne sera pas vu tant que le token
    // n'est pas explicitement rafraîchi) avant de rediriger.
    await update({ onboarded: true });

    router.push("/dashboard");
    router.refresh();
  }

  const inputStyle = { borderColor: "rgba(255,255,255,.07)", background: "#0e0c16", color: "#f0edf8" } as const;

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: "#0e0c16", color: "#f0edf8", fontFamily: "var(--font-body, 'Plus Jakarta Sans', system-ui)" }}
    >
      <div
        className="w-full max-w-lg rounded-[22px] border p-8"
        style={{ borderColor: "rgba(255,255,255,.07)", background: "#1a1628", boxShadow: "0 2px 8px rgba(0,0,0,.3), 0 20px 50px -28px rgba(120,80,240,.45)" }}
      >
        <div className="mb-6 flex items-center gap-[11px]">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: "linear-gradient(140deg, #9d7bf5, #c9b6fb)", boxShadow: "0 6px 18px -6px #9d7bf5" }}
          >
            <div className="h-[13px] w-[13px] rounded-[4px] bg-white" />
          </div>
          <div>
            <h1 className="text-[19px] font-extrabold tracking-tight text-[#f0edf8]">Bienvenue sur Folio</h1>
            <p className="text-[12.5px] text-[#a79fbd]">Quelques infos pour configurer ton dashboard</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Pseudo / nom */}
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-[#a79fbd]" htmlFor="name">
              Ton pseudo ou prénom
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[11px] border px-3 py-2 text-sm outline-none focus:ring-2"
              style={inputStyle}
              placeholder="Jeremy"
            />
          </div>

          {/* Type de compte */}
          <div>
            <label className="mb-2 block text-[12.5px] font-semibold text-[#a79fbd]">
              Quel(s) type(s) de compte veux-tu suivre ?
            </label>
            <div className="flex gap-3">
              {ACCOUNT_OPTIONS.map((opt) => {
                const checked = accountTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleAccountType(opt.value)}
                    className="flex-1 rounded-[14px] border p-4 text-left transition"
                    style={{
                      borderColor: checked ? "#9d7bf5" : "rgba(255,255,255,.07)",
                      background: checked ? "rgba(157,123,245,.12)" : "#221c34",
                    }}
                  >
                    <div className="text-[14px] font-bold text-[#f0edf8]">{opt.label}</div>
                    <div className="text-[11.5px] text-[#a79fbd]">{opt.description}</div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-[#6e6685]">Tu peux sélectionner les deux, ou aucun pour l'instant.</p>
          </div>

          {/* Watchlist */}
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-[#a79fbd]" htmlFor="ticker">
              Actions / ETF que tu veux suivre <span className="text-[#6e6685]">(optionnel)</span>
            </label>
            <div className="flex gap-2">
              <input
                id="ticker"
                type="text"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                onKeyDown={handleTickerKeyDown}
                className="flex-1 rounded-[11px] border px-3 py-2 text-sm outline-none focus:ring-2"
                style={inputStyle}
                placeholder="ex : AAPL, MC.PA…"
              />
              <button
                type="button"
                onClick={addTicker}
                className="rounded-[11px] border px-4 text-[13px] font-semibold"
                style={{ borderColor: "rgba(255,255,255,.07)", background: "#221c34", color: "#f0edf8" }}
              >
                Ajouter
              </button>
            </div>
            {watchlist.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {watchlist.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-[6px] rounded-full px-3 py-1 text-[12px] font-semibold"
                    style={{ background: "rgba(157,123,245,.14)", color: "#c9b6fb" }}
                  >
                    {t}
                    <button type="button" onClick={() => removeTicker(t)} className="text-[#c9b6fb] hover:text-[#f0edf8]">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Objectif */}
          <div>
            <label className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-[#a79fbd]">
              <input
                type="checkbox"
                checked={hasGoal}
                onChange={(e) => setHasGoal(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              J'ai un objectif de patrimoine en tête
            </label>
            {hasGoal && (
              <input
                type="number"
                min={0}
                step="1000"
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
                className="w-full rounded-[11px] border px-3 py-2 text-sm outline-none focus:ring-2"
                style={inputStyle}
                placeholder="ex : 200000"
              />
            )}
          </div>

          {error && <p className="text-[12.5px] text-[#e08a8a]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-[11px] px-4 py-[10px] text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(140deg, #9d7bf5, #c9b6fb)" }}
          >
            {loading ? "Configuration…" : "C'est parti"}
          </button>
        </form>
      </div>
    </main>
  );
}
