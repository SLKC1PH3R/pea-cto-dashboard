"use client";

import { DashboardWidget } from "./DashboardGrid";
import { TotalValueWidget } from "../widgets/TotalValueWidget";
import { FeesSummaryWidget } from "../widgets/FeesSummaryWidget";
import { PositionsTableWidget } from "../widgets/PositionsTableWidget";

type WidgetRendererProps = {
  widget: DashboardWidget;
  editMode: boolean;
  onRemove: () => void;
};

/**
 * Point d'entrée unique pour le rendu de chaque widget.
 * Ajoute un cas ici à chaque nouveau type de widget implémenté.
 * Les widgets non encore implémentés affichent un placeholder propre
 * plutôt que de planter le dashboard.
 */
export function WidgetRenderer({ widget, editMode, onRemove }: WidgetRendererProps) {
  return (
    <div className="flex h-full flex-col">
      {editMode && (
        <div className="flex justify-end border-b bg-gray-50 px-2 py-1">
          <button
            onClick={onRemove}
            className="text-xs text-gray-400 hover:text-red-500"
            aria-label="Supprimer le widget"
          >
            ✕ retirer
          </button>
        </div>
      )}
      <div className="flex-1 overflow-auto p-3">{renderContent(widget)}</div>
    </div>
  );
}

function renderContent(widget: DashboardWidget) {
  switch (widget.type) {
    case "TOTAL_VALUE":
      return <TotalValueWidget config={widget.config} />;
    case "FEES_SUMMARY":
      return <FeesSummaryWidget config={widget.config} />;
    case "POSITIONS_TABLE":
      return <PositionsTableWidget config={widget.config} />;
    case "PNL_CHART":
    case "ALLOCATION_SECTOR":
    case "ALLOCATION_GEO":
    case "ALLOCATION_CURRENCY":
    case "BENCHMARK_COMPARISON":
    case "DIVIDEND_CALENDAR":
    case "DEPOSITS_HISTORY":
    case "STOCK_VS_ETF":
      return <PlaceholderWidget label={widget.type} />;
    default:
      return <PlaceholderWidget label={widget.type} />;
  }
}

function PlaceholderWidget({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center text-gray-400">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs">Widget à implémenter</p>
    </div>
  );
}
