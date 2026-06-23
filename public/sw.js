/**
 * Service Worker de Folio — mise en cache minimale pour permettre une
 * ouverture hors-ligne basique et accélérer les visites répétées.
 *
 * Stratégies :
 *  - Navigation (HTML) : network-first → repli sur la dernière version mise
 *    en cache de la page demandée, sinon /offline.html. On ne veut jamais
 *    servir une page figée à un utilisateur connecté : le réseau a toujours
 *    la priorité, le cache n'est qu'un filet de sécurité.
 *  - Assets statiques same-origin (_next/static, /icons, fonts, images) :
 *    cache-first — immutables une fois construits, gain de perf direct.
 *  - /api/* : network-first, repli sur la dernière réponse GET connue si le
 *    réseau échoue (pas de cache pour POST/PUT/DELETE — ce sont des
 *    mutations, jamais sûr de les rejouer depuis un cache).
 *  - Tout le reste (autres origines, ex. cotations tradingview/boursorama) :
 *    laissé passer tel quel, sans interception.
 */

const VERSION = "folio-v2";
const STATIC_CACHE = `${VERSION}-static`;
const API_CACHE = `${VERSION}-api`;
const PRECACHE_URLS = ["/offline.html", "/manifest.webmanifest", "/folio-logo.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/apple-touch-icon.png" ||
    /\.(?:css|js|woff2?|ttf|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match("/offline.html");
  }
}

async function networkFirstApi(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === "GET") {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (request.method === "GET") {
      const cached = await caches.match(request);
      if (cached) return cached;
    }
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" && !request.url.includes("/api/")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstApi(request));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});
