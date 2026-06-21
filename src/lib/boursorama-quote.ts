/**
 * Cotation de repli via les pages publiques boursorama.com, pour les
 * actifs que Finnhub ne couvre pas en plan gratuit (ETF Euronext
 * Paris/Amsterdam notamment). Ce n'est PAS une API officielle/documentée :
 * on lit le JSON intégré dans l'attribut `data-ist-init` du HTML rendu
 * côté serveur (pas de JS à exécuter, pas de protection anti-bot
 * rencontrée sur ces pages au moment de l'écriture). Fragile par nature —
 * toute erreur réseau ou changement de mise en page renvoie simplement
 * `null`, et l'appelant retombe sur le cours manuel puis le PRU.
 */

const USER_AGENT = "Mozilla/5.0 (compatible; FolioDashboard/1.0; personal finance tracker)";

export type BoursoramaQuote = {
  price: number;
  dayPct: number;
};

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Retrouve le symbole interne Boursorama (ex: "1rTESE") à partir d'un ISIN,
 * via la recherche publique du site. Prend le premier résultat — qui
 * correspond en pratique à la cotation principale (Euronext Paris/Amsterdam).
 */
export async function findBoursoramaSymbol(isin: string): Promise<string | null> {
  const html = await fetchHtml(`https://www.boursorama.com/recherche/ajax?query=${encodeURIComponent(isin)}`);
  if (!html) return null;
  const m = html.match(/href="\/bourse\/trackers\/cours\/([^/"]+)\/"/);
  return m ? m[1] : null;
}

/**
 * Lit le dernier cours connu et la variation du jour pour un symbole
 * Boursorama donné, à partir du JSON `data-ist-init` embarqué dans la page.
 */
export async function getBoursoramaQuote(symbol: string): Promise<BoursoramaQuote | null> {
  const html = await fetchHtml(`https://www.boursorama.com/bourse/trackers/cours/${encodeURIComponent(symbol)}/`);
  if (!html) return null;

  const re = /data-ist-init="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    try {
      const obj = JSON.parse(decoded) as { symbol?: string; last?: number; variation?: number };
      if (obj.symbol === symbol && typeof obj.last === "number") {
        return { price: obj.last, dayPct: typeof obj.variation === "number" ? obj.variation * 100 : 0 };
      }
    } catch {
      // fragment JSON malformé ou non pertinent — on continue
    }
  }
  return null;
}

export async function getBoursoramaQuoteByIsin(isin: string): Promise<BoursoramaQuote | null> {
  const symbol = await findBoursoramaSymbol(isin);
  if (!symbol) return null;
  return getBoursoramaQuote(symbol);
}
