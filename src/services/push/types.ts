/**
 * Types partagés pour les futures notifications push (non implémentées).
 * Préparation d'architecture uniquement — aucune route, aucun modèle Prisma,
 * aucun envoi réel tant que cette fonctionnalité n'est pas explicitement
 * demandée.
 */

export type PushAlertKind = "PRICE_ALERT" | "PORTFOLIO_DAILY_SUMMARY" | "DEPOSIT_CAP_WARNING";

export interface PushAlertPayload {
  kind: PushAlertKind;
  title: string;
  body: string;
  /** Route relative à ouvrir au clic, ex: "/dashboard?tab=marches" */
  url?: string;
  ticker?: string;
}

/** Forme stockée d'un abonnement push navigateur (PushSubscription.toJSON()). */
export interface StoredPushSubscription {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}
