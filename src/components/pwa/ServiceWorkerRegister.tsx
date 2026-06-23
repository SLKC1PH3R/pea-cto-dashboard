"use client";

import { useEffect } from "react";

/**
 * Enregistre le Service Worker au chargement et recharge la page une seule
 * fois lorsqu'une nouvelle version a pris le contrôle — sinon un onglet
 * resté ouvert continuerait à tourner sur l'ancien JS pendant que le SW
 * actif a changé sous lui (skipWaiting + clients.claim côté sw.js).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let refreshed = false;
    const onControllerChange = () => {
      if (refreshed) return;
      refreshed = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Pas de SW = juste pas de hors-ligne/cache, l'app reste utilisable.
      });
    });

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return null;
}
