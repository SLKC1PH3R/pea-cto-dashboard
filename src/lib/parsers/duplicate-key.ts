/**
 * Clé de déduplication "par contenu" pour les imports Boursorama — nécessaire
 * car un même mouvement (achat/vente/dépôt) peut apparaître à la fois dans un
 * avis d'opéré (1 fichier par ordre, date+heure précise, avec une référence
 * d'ordre unique) et dans le relevé espèces mensuel (toutes les opérations du
 * mois, date seule, pas d'heure, pas de référence). On ne peut donc pas
 * dédupliquer sur l'horodatage exact ni sur le nom de fichier.
 *
 * Piège à éviter : un même gros ordre peut être exécuté en plusieurs fois le
 * même jour, au même cours — produisant plusieurs avis d'opéré avec la même
 * quantité/le même montant mais des références d'ordre distinctes. Ce ne sont
 * PAS des doublons. La référence d'ordre (quand disponible, sur les avis
 * d'opéré) est donc le signal prioritaire et fait foi ; le repli jour civil +
 * actif + sens + montant ne sert qu'aux formats qui n'ont pas de référence
 * (relevé espèces), pour détecter les doublons entre formats différents.
 */

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function txHeuristicKey(ticker: string, type: "BUY" | "SELL", amount: number, date: Date): string {
  return `${ticker.toUpperCase()}|${type}|${dayKey(date)}|${amount.toFixed(2)}`;
}

export function txReferenceKey(reference: string): string {
  return `ref:${reference}`;
}

export function depositDuplicateKey(amount: number, date: Date): string {
  return `${dayKey(date)}|${amount.toFixed(2)}`;
}
