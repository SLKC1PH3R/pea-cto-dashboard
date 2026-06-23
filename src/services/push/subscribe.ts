"use client";

/**
 * Helper client pour un futur abonnement push — non câblé à une UI tant que
 * la fonctionnalité n'est pas demandée (pas de bouton "Activer les
 * alertes", pas d'appel API de sauvegarde). Garde déjà la conversion VAPID
 * (urlBase64ToUint8Array) qui est systématiquement le détail le plus
 * pénible à re-écrire correctement.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0))) as Uint8Array<ArrayBuffer>;
}

export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}
