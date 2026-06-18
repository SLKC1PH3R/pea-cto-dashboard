"use client";

import { useState, useCallback } from "react";
import ReactGridLayout, { WidthProvider } from "react-grid-layout";
import type { Layout as RGLLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { WIDGET_CATALOG, WidgetType } from "@/types/dashboard";
import { WidgetRenderer } from "./WidgetRenderer";

const ResponsiveGridLayout = WidthProvider(ReactGridLayout.Responsive);

export type DashboardWidget = {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Record<string, unknown>;
};

type DashboardGridProps = {
  layoutId: string;
  initialWidgets: DashboardWidget[];
  onLayoutChange?: (widgets: DashboardWidget[]) => void;
};

export function DashboardGrid({ layoutId, initialWidgets, onLayoutChange }: DashboardGridProps) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(initialWidgets);
  const [editMode, setEditMode] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);

  const layout: RGLLayout[] = widgets.map((w) => ({
    i: w.id,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
  }));

  const persist = useCallback(
    async (updated: DashboardWidget[]) => {
      setWidgets(updated);
      onLayoutChange?.(updated);

      // Persistance côté serveur (best-effort, ne bloque pas l'UI)
      try {
        await fetch(`/api/layouts/${layoutId}/widgets`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widgets: updated }),
        });
      } catch {
        // silencieux : on retentera au prochain changement
      }
    },
    [layoutId, onLayoutChange]
  );

  function handleLayoutChange(newLayout: RGLLayout[]) {
    const updated = widgets.map((w) => {
      const match = newLayout.find((l) => l.i === w.id);
      if (!match) return w;
      return { ...w, x: match.x, y: match.y, w: match.w, h: match.h };
    });
    persist(updated);
  }

  function addWidget(type: WidgetType) {
    const def = WIDGET_CATALOG.find((d) => d.type === type);
    if (!def) return;

    const newWidget: DashboardWidget = {
      id: `widget-${Date.now()}`,
      type,
      x: 0,
      y: Infinity, // react-grid-layout place automatiquement en bas
      w: def.defaultSize.w,
      h: def.defaultSize.h,
    };

    persist([...widgets, newWidget]);
    setShowCatalog(false);
  }

  function removeWidget(id: string) {
    persist(widgets.filter((w) => w.id !== id));
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Dashboard</h2>
        <div className="flex gap-2">
          {editMode && (
            <button
              onClick={() => setShowCatalog((s) => !s)}
              className="rounded-md bg-terracotta px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              + Ajouter un widget
            </button>
          )}
          <button
            onClick={() => setEditMode((e) => !e)}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            {editMode ? "Terminer l'édition" : "Personnaliser"}
          </button>
        </div>
      </div>

      {showCatalog && (
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border bg-white p-4 md:grid-cols-3">
          {WIDGET_CATALOG.map((def) => (
            <button
              key={def.type}
              onClick={() => addWidget(def.type)}
              className="rounded-md border p-3 text-left hover:border-terracotta hover:bg-orange-50"
            >
              <div className="font-medium">{def.label}</div>
              <div className="text-xs text-gray-500">{def.description}</div>
            </button>
          ))}
        </div>
      )}

      <ResponsiveGridLayout
        className="layout"
        layouts={{ lg: layout }}
        breakpoints={{ lg: 1024, md: 768, sm: 480 }}
        cols={{ lg: 12, md: 8, sm: 4 }}
        rowHeight={80}
        isDraggable={editMode}
        isResizable={editMode}
        onLayoutChange={handleLayoutChange}
        compactType="vertical"
      >
        {widgets.map((widget) => (
          <div key={widget.id} className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <WidgetRenderer
              widget={widget}
              editMode={editMode}
              onRemove={() => removeWidget(widget.id)}
            />
          </div>
        ))}
      </ResponsiveGridLayout>

      {widgets.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-gray-500">
          Aucun widget pour l'instant. Clique sur "Personnaliser" puis "Ajouter un widget" pour commencer.
        </div>
      )}
    </div>
  );
}
