"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type GoalFormProps = {
  initialGoal: number | null;
};

export function GoalForm({ initialGoal }: GoalFormProps) {
  const router = useRouter();
  const [goalAmount, setGoalAmount] = useState(initialGoal ? String(initialGoal) : "");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    const amount = goalAmount ? Number(goalAmount) : null;
    await fetch("/api/goal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalAmount: amount }),
    });

    setSubmitting(false);
    setFeedback("Objectif enregistré.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-[12.5px] font-semibold text-[var(--fg2)]">Montant cible</label>
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          step="1000"
          value={goalAmount}
          onChange={(e) => setGoalAmount(e.target.value)}
          placeholder="ex : 200000"
          className="flex-1 rounded-[11px] border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-[11px] px-4 py-[9px] text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(140deg, var(--accent), var(--accent2))" }}
        >
          {submitting ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      {feedback && <p className="text-[12.5px]" style={{ color: "var(--pos)" }}>{feedback}</p>}
    </form>
  );
}
