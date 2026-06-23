/**
 * Parse l'export "performance.csv" du courtier (Boursorama) — valorisation
 * réelle quotidienne du portefeuille, et performance cumulée (TWR) calculée
 * par le courtier lui-même. Format observé :
 *
 *   "Date","Valorisation portefeuille","Perf période portefeuille","Perf cumulée portefeuille"
 *   "2023-09-04","50","0%","0%"
 *   "2023-09-14","5523.8648","1,25%","0,316%"
 *
 * On ignore la colonne "Perf période" (variation jour à jour, pas utile ici)
 * mais on garde "Perf cumulée" : c'est le TWR ("time weighted return") du
 * courtier depuis l'origine, la seule source qui reproduit exactement leur
 * chiffre — pas la peine de le recalculer nous-mêmes quand il est fourni.
 * Découpage champ par champ via les guillemets plutôt qu'un simple
 * split(",") : les colonnes de performance utilisent la virgule comme
 * séparateur décimal ("1,25%"), ce qui casserait un split naïf — mais comme
 * chaque champ est individuellement entre guillemets, matcher les groupes
 * "..." reste correct quel que soit leur contenu interne.
 */

export interface PerformanceCsvRow {
  date: Date;
  value: number;
  /** Performance cumulée (TWR) en %, ex: 22.199 pour "22,199%" — `null` si absente/invalide. */
  cumulativeReturnPct: number | null;
}

function parseFrenchPercent(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace("%", "").replace(",", ".").trim());
  return Number.isNaN(n) ? null : n;
}

export function parsePerformanceCsv(text: string): PerformanceCsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: PerformanceCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].match(/"([^"]*)"/g)?.map((f) => f.slice(1, -1));
    if (!fields || fields.length < 2) continue;

    const date = new Date(fields[0]);
    const value = Number(fields[1]);
    if (Number.isNaN(date.getTime()) || Number.isNaN(value)) continue;

    rows.push({ date, value, cumulativeReturnPct: parseFrenchPercent(fields[3]) });
  }

  return rows;
}
