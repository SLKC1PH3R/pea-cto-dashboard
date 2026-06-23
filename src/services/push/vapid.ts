import type { VapidKeys } from "./types";

/**
 * Lecture des clés VAPID — non utilisée tant que les notifications push ne
 * sont pas implémentées. Préparée à l'avance pour que l'activation future
 * se limite à : générer les clés (`npx web-push generate-vapid-keys`), les
 * poser en variables d'environnement, et écrire le code d'envoi dans
 * `send.ts` (encore à créer) en s'appuyant sur ces clés.
 */
export function getVapidKeys(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}
