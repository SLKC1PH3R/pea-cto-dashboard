/**
 * Constantes et helpers partagés entre background.js et popup.js. Pas de
 * build step pour cette extension (MV3 simple, du JS brut) — ce fichier est
 * importé via <script> classique dans popup.html et via `importScripts`
 * dans le service worker.
 */

const FOLIO_API_BASE = "https://folio.digitalstack.cloud";
const FOLIO_TOKEN_KEY = "folioApiToken";
const FOLIO_CACHE_KEY = "folioLastSnapshot";

async function folioGetToken() {
  const stored = await chrome.storage.local.get(FOLIO_TOKEN_KEY);
  return stored[FOLIO_TOKEN_KEY] || null;
}

async function folioFetchSnapshot() {
  const token = await folioGetToken();
  if (!token) return { error: "no-token" };

  try {
    const res = await fetch(`${FOLIO_API_BASE}/api/extension`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 401) return { error: "invalid-token" };
    if (!res.ok) return { error: "network" };

    const data = await res.json();
    const snapshot = { ...data, fetchedAt: Date.now() };
    await chrome.storage.local.set({ [FOLIO_CACHE_KEY]: snapshot });
    return snapshot;
  } catch {
    return { error: "network" };
  }
}

async function folioGetCachedSnapshot() {
  const stored = await chrome.storage.local.get(FOLIO_CACHE_KEY);
  return stored[FOLIO_CACHE_KEY] || null;
}
