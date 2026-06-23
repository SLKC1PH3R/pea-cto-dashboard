/**
 * Service worker MV3 — non persistant, donc on utilise `chrome.alarms`
 * plutôt que `setInterval` (qui serait tué avec le worker entre deux
 * réveils). Rafraîchit le badge toutes les 5 minutes et au démarrage du
 * navigateur / install de l'extension.
 */
importScripts("shared.js");

const ALARM_NAME = "folio-refresh";

async function refreshBadge() {
  const snapshot = await folioFetchSnapshot();

  if (snapshot.error) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }

  // Le badge Chrome n'affiche que ~4 caractères de façon fiable — on arrondit
  // donc au pourcent entier plutôt que d'afficher une décimale tronquée.
  const pct = snapshot.dailyPercent ?? 0;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  chrome.action.setBadgeText({ text: `${sign}${Math.abs(Math.round(pct))}%` });
  chrome.action.setBadgeBackgroundColor({ color: pct >= 0 ? "#5fc7a0" : "#e08a8a" });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
  refreshBadge();
});

chrome.runtime.onStartup.addListener(() => {
  refreshBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) refreshBadge();
});

// Permet au popup ou à la page d'options de déclencher un refresh immédiat
// après la saisie d'un nouveau token, sans attendre la prochaine alarme.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "folio-refresh-now") refreshBadge();
});
