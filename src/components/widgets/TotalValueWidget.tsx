"use client";

import { useEffect, useState } from "react";

type AccountSummary = {
  totalValue: number;
  totalAcquisitionCost: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  realizedPnl: number;
  hasProjectedTransactions?: boolean;
};

type TotalValueWidgetProps = {
  config?: Record<string, unknown>;
};

export function TotalValueWidget({ config }: TotalValueWidgetProps) {
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const accountId = config?.accountId as string | undefined;
    const params = accountId ? `?accountId=${accountId}` : "";

    fetch(`/api/portfolio/summary${params}`)
      .then((res) => res.json())
      .then((data) => setSummary(data))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [config]);

  if (loading) {
    return <div className="text-sm text-gray-400">Chargement…</div>;
  }

  if (!summary) {
    return <div className="text-sm text-gray-400">Aucune donnée disponible</div>;
  }

  const pnlPositive = summary.unrealizedPnl >= 0;

  return (
    <div className="flex h-full flex-col justify-center gap-1">
      <span className="text-xs uppercase tracking-wide text-gray-400">Valeur totale</span>
      <span className="text-2xl font-semibold">
        {summary.totalValue.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
      </span>
      <span className={`text-sm font-medium ${pnlPositive ? "text-green-600" : "text-red-600"}`}>
        {pnlPositive ? "+" : ""}
        {summary.unrealizedPnl.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
        {" "}
        ({(summary.unrealizedPnlPct * 100).toFixed(2)}%)
      </span>
      <span className="text-xs text-gray-400">
        Réalisé : {summary.realizedPnl.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
      </span>
      {summary.hasProjectedTransactions && (
        <span className="mt-1 inline-block w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
          Inclut des estimations DCA
        </span>
      )}
    </div>
  );
}
