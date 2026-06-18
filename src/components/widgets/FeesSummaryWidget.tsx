"use client";

import { useEffect, useState } from "react";

type FeesSummary = {
  totalFeesAllTime: number;
  totalFeesLast12m: number;
  annualFeeRatio: number; // décimal, ex: 0.012 = 1.2%
  byType: { type: string; amount: number }[];
};

type FeesSummaryWidgetProps = {
  config?: Record<string, unknown>;
};

export function FeesSummaryWidget({ config }: FeesSummaryWidgetProps) {
  const [data, setData] = useState<FeesSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const accountId = config?.accountId as string | undefined;
    const params = accountId ? `?accountId=${accountId}` : "";

    fetch(`/api/portfolio/fees${params}`)
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [config]);

  if (loading) return <div className="text-sm text-gray-400">Chargement…</div>;
  if (!data) return <div className="text-sm text-gray-400">Aucune donnée disponible</div>;

  return (
    <div className="flex h-full flex-col gap-2">
      <span className="text-xs uppercase tracking-wide text-gray-400">Frais</span>

      <div className="flex justify-between">
        <span className="text-sm text-gray-600">Total cumulé</span>
        <span className="text-sm font-medium">
          {data.totalFeesAllTime.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
        </span>
      </div>

      <div className="flex justify-between">
        <span className="text-sm text-gray-600">12 derniers mois</span>
        <span className="text-sm font-medium">
          {data.totalFeesLast12m.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
        </span>
      </div>

      <div className="flex justify-between border-t pt-2">
        <span className="text-sm text-gray-600">Frais annuel</span>
        <span className="text-sm font-semibold">
          {(data.annualFeeRatio * 100).toFixed(2)}%
        </span>
      </div>

      {data.byType.length > 0 && (
        <div className="mt-2 space-y-1">
          {data.byType.map((item) => (
            <div key={item.type} className="flex justify-between text-xs text-gray-400">
              <span>{item.type}</span>
              <span>{item.amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
