export type WidgetType =
  | "TOTAL_VALUE"
  | "PNL_CHART"
  | "ALLOCATION_SECTOR"
  | "ALLOCATION_GEO"
  | "ALLOCATION_CURRENCY"
  | "BENCHMARK_COMPARISON"
  | "FEES_SUMMARY"
  | "DIVIDEND_CALENDAR"
  | "POSITIONS_TABLE"
  | "DEPOSITS_HISTORY"
  | "STOCK_VS_ETF";

export type WidgetDefinition = {
  type: WidgetType;
  label: string;
  description: string;
  defaultSize: { w: number; h: number };
};

/**
 * Catalogue des widgets disponibles pour le dashboard customisable.
 * Sert à générer le menu "Ajouter un widget" côté front.
 */
export const WIDGET_CATALOG: WidgetDefinition[] = [
  {
    type: "TOTAL_VALUE",
    label: "Valeur totale",
    description: "Valeur totale du portefeuille + P&L latent/réalisé",
    defaultSize: { w: 3, h: 2 },
  },
  {
    type: "PNL_CHART",
    label: "Courbe de performance",
    description: "Évolution du P&L dans le temps",
    defaultSize: { w: 6, h: 4 },
  },
  {
    type: "ALLOCATION_SECTOR",
    label: "Allocation sectorielle",
    description: "Répartition du portefeuille par secteur",
    defaultSize: { w: 4, h: 4 },
  },
  {
    type: "ALLOCATION_GEO",
    label: "Allocation géographique",
    description: "Répartition du portefeuille par zone géographique",
    defaultSize: { w: 4, h: 4 },
  },
  {
    type: "ALLOCATION_CURRENCY",
    label: "Allocation par devise",
    description: "Exposition aux devises (EUR, USD...)",
    defaultSize: { w: 4, h: 4 },
  },
  {
    type: "BENCHMARK_COMPARISON",
    label: "Comparaison benchmark",
    description: "Performance vs CAC40 / MSCI World",
    defaultSize: { w: 6, h: 4 },
  },
  {
    type: "FEES_SUMMARY",
    label: "Résumé des frais",
    description: "Frais cumulés et frais annuel en %",
    defaultSize: { w: 3, h: 3 },
  },
  {
    type: "DIVIDEND_CALENDAR",
    label: "Calendrier dividendes",
    description: "Historique et calendrier des dividendes versés",
    defaultSize: { w: 4, h: 4 },
  },
  {
    type: "POSITIONS_TABLE",
    label: "Tableau des positions",
    description: "Détail ligne par ligne avec yield et performance",
    defaultSize: { w: 8, h: 5 },
  },
  {
    type: "DEPOSITS_HISTORY",
    label: "Historique des dépôts",
    description: "Historique des versements et retraits",
    defaultSize: { w: 4, h: 4 },
  },
  {
    type: "STOCK_VS_ETF",
    label: "Action vs ETF équivalent",
    description: "Compare la perf d'une action vs son ETF de référence",
    defaultSize: { w: 6, h: 4 },
  },
];

export type PositionMetrics = {
  positionId: string;
  ticker: string;
  name: string;
  assetType: "ACTION" | "ETF_DISTRIBUANT" | "ETF_CAPITALISANT" | "CRYPTO";
  quantity: number;
  averageCostPrice: number;
  currentPrice: number;
  marketValue: number;
  acquisitionCost: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  yieldOnCost: number | null; // null pour les ETF capitalisants
  currentYield: number | null;
  benchmarkTicker: string | null;
  benchmarkReturn: number | null; // perf de l'ETF équivalent sur la même période de détention
};
