/**
 * Clé de déduplication "par contenu" pour les imports Boursorama — nécessaire
 * car un même mouvement (achat/vente/dépôt) peut apparaître à la fois dans un
 * avis d'opéré (1 fichier par ordre, date+heure précise) et dans le relevé
 * espèces mensuel (toutes les opérations du mois, date seule, pas d'heure).
 * On ne peut donc pas dédupliquer sur l'horodatage exact ni sur le nom de
 * fichier : on compare jour civil + actif + sens + montant.
 */

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function txDuplicateKey(ticker: string, type: "BUY" | "SELL", amount: number, date: Date): string {
  return `${ticker.toUpperCase()}|${type}|${dayKey(date)}|${amount.toFixed(2)}`;
}

export function depositDuplicateKey(amount: number, date: Date): string {
  return `${dayKey(date)}|${amount.toFixed(2)}`;
}
