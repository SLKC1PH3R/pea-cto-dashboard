// Lance Lighthouse via l'API Node directement (au lieu du CLI) pour pouvoir
// avaler l'erreur de nettoyage du dossier temporaire de chrome-launcher, un
// bug connu sous Windows (EPERM sur rmSync du tmp profile) qui fait planter
// le process CLI après que l'audit a déjà produit son résultat.
import { writeFileSync } from "node:fs";
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";

const url = process.argv[2] || "http://localhost:3100/login";

const chrome = await launch({ chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] });

try {
  const result = await lighthouse(url, {
    port: chrome.port,
    output: "json",
    onlyCategories: ["performance", "accessibility", "best-practices"],
    logLevel: "error",
  });

  const { categories, audits } = result.lhr;
  for (const [key, cat] of Object.entries(categories)) {
    console.log(`${key}: ${Math.round(cat.score * 100)}`);
  }
  // Lighthouse 12+ a retiré la catégorie "pwa" agrégée — on inspecte donc
  // directement les audits PWA individuels encore présents.
  const pwaAuditIds = ["installable-manifest", "service-worker", "viewport", "themed-omnibox", "maskable-icon", "splash-screen"];
  console.log("--- PWA audits ---");
  for (const id of pwaAuditIds) {
    const a = audits[id];
    if (a) console.log(`${id}: ${a.score === null ? "n/a" : a.score === 1 ? "PASS" : "FAIL"} ${a.score === 1 ? "" : "- " + (a.explanation || a.title)}`);
  }
  writeFileSync("./lighthouse-report.json", result.report);
} finally {
  try {
    await chrome.kill();
  } catch {
    // bug connu chrome-launcher/Windows au nettoyage du tmp dir — sans impact
    // sur le résultat de l'audit, déjà écrit ci-dessus.
  }
}
