"use client";

import { useEffect, useState } from "react";

type DcaRuleRow = {
  id: string;
  accountName: string;
  assetTicker: string;
  assetName: string;
  amount: number;
  frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  firstExecution: string;
  active: boolean;
  note: string | null;
  executionsCount: number;
  lastExecutionDate: string | null;
};

const FREQUENCY_LABEL: Record<DcaRuleRow["frequency"], string> = {
  WEEKLY: "Hebdomadaire",
  BIWEEKLY: "Bimensuelle",
  MONTHLY: "Mensuelle",
};

export function DcaRulesManager() {
  const [rules, setRules] = useState<DcaRuleRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/dca-rules");
    if (!res.ok) return;
    setRules(await res.json());
  }

  useEffect(() => {
    load();
    window.addEventListener("dca-rule-created", load);
    return () => window.removeEventListener("dca-rule-created", load);
  }, []);

  async function toggleActive(rule: DcaRuleRow) {
    setBusyId(rule.id);
    await fetch(`/api/dca-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rule.active }),
    });
    setBusyId(null);
    load();
  }

  async function syncNow(rule: DcaRuleRow) {
    setBusyId(rule.id);
    setFeedback(null);
    const res = await fetch(`/api/dca-rules/${rule.id}/sync`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (res.ok) {
      setFeedback(
        data.created > 0
          ? `${data.created} exécution(s) générée(s) pour ${rule.assetName}.`
          : `${rule.assetName} est déjà à jour.`
      );
      load();
    } else {
      setFeedback(data.error ?? "Erreur lors de la synchronisation");
    }
  }

  if (rules === null) {
    return <p className="text-[13px] text-[var(--fg2)]">Chargement…</p>;
  }

  if (rules.length === 0) {
    return <p className="text-[13px] text-[var(--fg2)]">Aucun plan DCA créé pour l'instant.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-[var(--fg2)]">
        Un plan actif génère automatiquement ses prochaines exécutions à chaque visite du dashboard
        — pas besoin de revenir ici chaque semaine. Mets-le en pause si tu veux l'arrêter temporairement.
      </p>
      <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: "var(--line)" }}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--line)" }}>
              <th className="px-3 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Compte</th>
              <th className="px-2 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Actif</th>
              <th className="px-2 py-2 text-right text-[11px] uppercase text-[var(--fg3)]">Montant</th>
              <th className="px-2 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Fréquence</th>
              <th className="px-2 py-2 text-left text-[11px] uppercase text-[var(--fg3)]">Dernière exécution</th>
              <th className="px-2 py-2 text-right text-[11px] uppercase text-[var(--fg3)]">Statut</th>
              <th className="px-3 py-2 text-right text-[11px] uppercase text-[var(--fg3)]"></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-b" style={{ borderColor: "var(--line)" }}>
                <td className="px-3 py-2 text-[var(--fg2)]">{r.accountName}</td>
                <td className="px-2 py-2">
                  <div className="flex flex-col leading-[1.2]">
                    <span className="font-semibold text-[var(--fg)]">{r.assetName}</span>
                    <span className="text-[11px] text-[var(--fg3)]">{r.assetTicker}</span>
                  </div>
                </td>
                <td className="px-2 py-2 text-right text-[var(--fg2)]">{r.amount.toLocaleString("fr-FR")} €</td>
                <td className="px-2 py-2 text-[var(--fg2)]">{FREQUENCY_LABEL[r.frequency]}</td>
                <td className="px-2 py-2 text-[var(--fg2)]">
                  {r.lastExecutionDate ?? "—"} <span className="text-[11px] text-[var(--fg3)]">({r.executionsCount} au total)</span>
                </td>
                <td className="px-2 py-2 text-right">
                  <span
                    className="rounded-[7px] px-2 py-[3px] text-[11px] font-bold"
                    style={
                      r.active
                        ? { background: "var(--posbg)", color: "var(--pos)" }
                        : { background: "var(--negbg)", color: "var(--neg)" }
                    }
                  >
                    {r.active ? "actif" : "en pause"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    {r.active && (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => syncNow(r)}
                        className="rounded-[7px] border px-2 py-1 text-[11px] disabled:opacity-50"
                        style={{ borderColor: "var(--line)", color: "var(--fg2)" }}
                      >
                        Synchroniser
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => toggleActive(r)}
                      className="rounded-[7px] border px-2 py-1 text-[11px] disabled:opacity-50"
                      style={{ borderColor: "var(--line)", color: "var(--fg2)" }}
                    >
                      {r.active ? "Mettre en pause" : "Reprendre"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {feedback && <p className="text-[12.5px]" style={{ color: "var(--pos)" }}>{feedback}</p>}
    </div>
  );
}
