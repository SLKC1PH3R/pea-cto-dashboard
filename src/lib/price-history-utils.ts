/**
 * Helpers partagés pour naviguer dans un historique de cours quotidiens
 * Yahoo Finance (clés "YYYY-MM-DD") — utilisés à la fois pour le TWR
 * "maison" (dashboard-data.ts) et l'historique journalier des positions
 * (portfolio-history.ts). Jamais d'extrapolation vers l'avenir : on ne
 * cherche que dans le passé, sur une fenêtre de 10 jours (couvre
 * week-ends/jours fériés consécutifs).
 */

/** Cours connu le plus proche à la date donnée, en remontant dans le passé si besoin (inclut le jour même). */
export function nearestDailyPrice(history: Record<string, number>, day: string): number | undefined {
  if (history[day] !== undefined) return history[day];
  const d = new Date(`${day}T00:00:00.000Z`);
  for (let i = 1; i <= 10; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const k = d.toISOString().slice(0, 10);
    if (history[k] !== undefined) return history[k];
  }
  return undefined;
}

/** Cours du jour de bourse précédent (strictement avant `day`, jamais `day` lui-même). */
export function previousTradingDayPrice(history: Record<string, number>, day: string): number | undefined {
  const base = new Date(`${day}T00:00:00.000Z`);
  for (let i = 1; i <= 10; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    const k = d.toISOString().slice(0, 10);
    if (history[k] !== undefined) return history[k];
  }
  return undefined;
}
