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

/**
 * Variantes de la clé heuristique sur une fenêtre de J-4 à J+4 — le relevé
 * espèces utilise la date de comptabilisation (règlement), qui peut tomber
 * plusieurs jours après la date d'exécution réelle imprimée sur l'avis
 * d'opéré pour le même ordre. Un ±1 jour ne suffit pas : un ordre exécuté un
 * vendredi soir et réglé le lundi (week-end) crée déjà un écart de 3 jours
 * calendaires, et un jour férié peut encore l'allonger — cas réel observé
 * (achat ESE.PA exécuté le 01/08/2025, comptabilisé le 04/08/2025) qui
 * faisait passer le doublon inaperçu et gonflait artificiellement la
 * quantité détenue. À utiliser uniquement en lecture (recherche de doublon),
 * jamais pour enregistrer une clé, sous peine de masquer de vrais ordres
 * distincts à quelques jours d'écart.
 */
export function txHeuristicKeyVariants(ticker: string, type: "BUY" | "SELL", amount: number, date: Date): string[] {
  const oneDay = 24 * 60 * 60 * 1000;
  const offsets = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
  return offsets.map((offset) => txHeuristicKey(ticker, type, amount, new Date(date.getTime() + offset * oneDay)));
}

export function txReferenceKey(reference: string): string {
  return `ref:${reference}`;
}

export function depositDuplicateKey(amount: number, date: Date): string {
  return `${dayKey(date)}|${amount.toFixed(2)}`;
}

export function dividendDuplicateKey(ticker: string, amount: number, date: Date): string {
  return `${ticker.toUpperCase()}|${dayKey(date)}|${amount.toFixed(2)}`;
}
