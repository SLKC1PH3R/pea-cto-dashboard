/**
 * Parse l'export "performance.csv" du courtier (Boursorama) — valorisation
 * réelle quotidienne du portefeuille. Format observé :
 *
 *   "Date","Valorisation portefeuille","Perf période portefeuille","Perf cumulée portefeuille"
 *   "2023-09-04","50","0%","0%"
 *   "2023-09-14","5523.8648","1,25%","0,316%"
 *
 * On ignore les colonnes de performance (recalculées nous-mêmes ailleurs) et
 * on ne lit que Date + Valorisation. Découpage champ par champ via les
 * guillemets plutôt qu'un simple split(",") : les colonnes de performance
 * utilisent la virgule comme séparateur décimal ("1,25%"), ce qui casserait
 * un split naïf — mais comme chaque champ est individuellement entre
 * guillemets, matcher les groupes "..." reste correct quel que soit leur
 * contenu interne.
 */

export interface PerformanceCsvRow {
  date: Date;
  value: number;
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

    rows.push({ date, value });
  }

  return rows;
}
