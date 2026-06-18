"use client";

import { useEffect, useState } from "react";
import { PositionMetrics } from "@/types/dashboard";

type PositionsTableWidgetProps = {
  config?: Record<string, unknown>;
};

export function PositionsTableWidget({ config }: PositionsTableWidgetProps) {
  const [positions, setPositions] = useState<PositionMetrics[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const accountId = config?.accountId as string | undefined;
    const params = accountId ? `?accountId=${accountId}` : "";

    fetch(`/api/portfolio/positions${params}`)
      .then((res) => res.json())
      .then((d) => setPositions(d))
      .catch(() => setPositions(null))
      .finally(() => setLoading(false));
  }, [config]);

  if (loading) return <div className="text-sm text-gray-400">Chargement…</div>;
  if (!positions || positions.length === 0) {
    return <div className="text-sm text-gray-400">Aucune position</div>;
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white text-left text-xs uppercase text-gray-400">
          <tr>
            <th className="py-1 pr-2">Actif</th>
            <th className="py-1 pr-2 text-right">Qté</th>
            <th className="py-1 pr-2 text-right">PRU</th>
            <th className="py-1 pr-2 text-right">Cours</th>
            <th className="py-1 pr-2 text-right">Valeur</th>
            <th className="py-1 pr-2 text-right">P&L</th>
            <th className="py-1 pr-2 text-right">Yield</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.positionId} className="border-t">
              <td className="py-1.5 pr-2">
                <div className="font-medium">{p.ticker}</div>
                <div className="text-xs text-gray-400">{p.name}</div>
              </td>
              <td className="py-1.5 pr-2 text-right">{p.quantity}</td>
              <td className="py-1.5 pr-2 text-right">{p.averageCostPrice.toFixed(2)}</td>
              <td className="py-1.5 pr-2 text-right">{p.currentPrice.toFixed(2)}</td>
              <td className="py-1.5 pr-2 text-right">
                {p.marketValue.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </td>
              <td
                className={`py-1.5 pr-2 text-right font-medium ${
                  p.unrealizedPnl >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {(p.unrealizedPnlPct * 100).toFixed(1)}%
              </td>
              <td className="py-1.5 pr-2 text-right text-gray-500">
                {p.assetType === "ETF_CAPITALISANT"
                  ? "Capit."
                  : p.yieldOnCost !== null
                  ? `${(p.yieldOnCost * 100).toFixed(2)}%`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
