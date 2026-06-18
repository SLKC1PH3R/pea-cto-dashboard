import { Decimal } from "@prisma/client/runtime/client";

/**
 * Calculs financiers centraux pour le dashboard PEA/CTO.
 * Toutes les fonctions sont pures : (données) => résultat, pas d'I/O ici.
 */

export type TxLike = {
  type: "BUY" | "SELL";
  quantity: Decimal | number;
  price: Decimal | number;
  fees: Decimal | number;
  date: Date;
};

export type DividendLike = {
  netAmount: Decimal | number;
  date: Date;
};

function toNum(v: Decimal | number): number {
  return typeof v === "number" ? v : v.toNumber();
}

/**
 * Quantité détenue actuellement, à partir de l'historique de transactions.
 */
export function currentQuantity(transactions: TxLike[]): number {
  return transactions.reduce((acc, tx) => {
    const qty = toNum(tx.quantity);
    return tx.type === "BUY" ? acc + qty : acc - qty;
  }, 0);
}

/**
 * Prix de revient moyen pondéré (PRU) sur la quantité actuellement détenue.
 * Utilise la méthode du coût moyen pondéré (la plus simple et la plus
 * couramment retenue par les courtiers français pour le PEA/CTO).
 */
export function averageCostPrice(transactions: TxLike[]): number {
  let qty = 0;
  let totalCost = 0;

  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const tx of sorted) {
    const txQty = toNum(tx.quantity);
    const txPrice = toNum(tx.price);
    const txFees = toNum(tx.fees);

    if (tx.type === "BUY") {
      totalCost += txQty * txPrice + txFees;
      qty += txQty;
    } else {
      // À la vente, on retire la quantité au coût moyen courant (pas de recalcul du passé)
      const avgBeforeSale = qty > 0 ? totalCost / qty : 0;
      totalCost -= avgBeforeSale * txQty;
      qty -= txQty;
    }
  }

  return qty > 0 ? totalCost / qty : 0;
}

/**
 * Coût total d'acquisition de la position actuellement détenue
 * (quantité actuelle × PRU).
 */
export function totalAcquisitionCost(transactions: TxLike[]): number {
  return currentQuantity(transactions) * averageCostPrice(transactions);
}

/**
 * P&L latent = valeur actuelle - coût d'acquisition de la position détenue.
 */
export function unrealizedPnl(transactions: TxLike[], currentPrice: number): number {
  const qty = currentQuantity(transactions);
  const cost = totalAcquisitionCost(transactions);
  return qty * currentPrice - cost;
}

/**
 * P&L réalisé = somme des plus/moins-values sur toutes les ventes,
 * calculé au PRU courant au moment de chaque vente.
 */
export function realizedPnl(transactions: TxLike[]): number {
  let qty = 0;
  let totalCost = 0;
  let realized = 0;

  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const tx of sorted) {
    const txQty = toNum(tx.quantity);
    const txPrice = toNum(tx.price);
    const txFees = toNum(tx.fees);

    if (tx.type === "BUY") {
      totalCost += txQty * txPrice + txFees;
      qty += txQty;
    } else {
      const avgBeforeSale = qty > 0 ? totalCost / qty : 0;
      const proceeds = txQty * txPrice - txFees;
      const costOfSold = avgBeforeSale * txQty;
      realized += proceeds - costOfSold;
      totalCost -= costOfSold;
      qty -= txQty;
    }
  }

  return realized;
}

/**
 * Frais annuels en % de la valeur moyenne du portefeuille sur la période.
 * frais : montant total des frais sur la période (12 mois glissants par ex.)
 * avgPortfolioValue : valeur moyenne du portefeuille sur cette même période.
 */
export function annualFeeRatio(totalFees: number, avgPortfolioValue: number): number {
  if (avgPortfolioValue <= 0) return 0;
  return totalFees / avgPortfolioValue;
}

/**
 * Yield on cost : rendement des dividendes des 12 derniers mois
 * par rapport au coût d'acquisition (pas à la valeur de marché actuelle).
 * C'est la métrique pertinente pour juger la rentabilité réelle de l'achat initial.
 */
export function yieldOnCost(
  dividends: DividendLike[],
  acquisitionCost: number,
  asOf: Date = new Date()
): number {
  if (acquisitionCost <= 0) return 0;
  const oneYearAgo = new Date(asOf);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const last12mDividends = dividends
    .filter((d) => d.date >= oneYearAgo && d.date <= asOf)
    .reduce((sum, d) => sum + toNum(d.netAmount), 0);

  return last12mDividends / acquisitionCost;
}

/**
 * Yield courant : rendement des dividendes des 12 derniers mois
 * par rapport à la valeur de marché actuelle.
 */
export function currentYield(
  dividends: DividendLike[],
  currentMarketValue: number,
  asOf: Date = new Date()
): number {
  if (currentMarketValue <= 0) return 0;
  const oneYearAgo = new Date(asOf);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const last12mDividends = dividends
    .filter((d) => d.date >= oneYearAgo && d.date <= asOf)
    .reduce((sum, d) => sum + toNum(d.netAmount), 0);

  return last12mDividends / currentMarketValue;
}

/**
 * Performance simple en % entre deux prix (utilisé pour la comparaison
 * stock vs ETF équivalent sur une période donnée).
 */
export function simpleReturn(startPrice: number, endPrice: number): number {
  if (startPrice <= 0) return 0;
  return (endPrice - startPrice) / startPrice;
}

/**
 * Time-Weighted Return (TWR) approximatif par sous-périodes entre chaque
 * mouvement de cash (dépôt/retrait). C'est la méthode standard pour mesurer
 * la performance d'un portefeuille indépendamment des flux de trésorerie.
 *
 * valuations : valeur du portefeuille juste AVANT chaque flux + valeur finale
 * cashflows : montants des flux (positif = dépôt, négatif = retrait), alignés par date
 */
export function timeWeightedReturn(
  periodReturns: { startValue: number; endValue: number; cashflow: number }[]
): number {
  // Pour chaque sous-période : (endValue - cashflow) / startValue - 1
  // puis on chaîne géométriquement (produit des (1+r) - 1)
  let cumulative = 1;
  for (const period of periodReturns) {
    if (period.startValue <= 0) continue;
    const r = (period.endValue - period.cashflow) / period.startValue;
    cumulative *= r;
  }
  return cumulative - 1;
}

/**
 * Génère les dates d'exécution prévues d'un plan DCA (investissement
 * programmé) entre sa première exécution et une date de fin (généralement
 * "aujourd'hui"), selon sa fréquence.
 *
 * Utilisé pour projeter les transactions Trade Republic dont on n'a que
 * la confirmation de création du plan, pas les confirmations d'exécution
 * individuelles.
 */
export function generateDcaExecutionDates(
  firstExecution: Date,
  frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY",
  until: Date = new Date()
): Date[] {
  const dates: Date[] = [];
  let current = new Date(firstExecution);

  const incrementDays = frequency === "WEEKLY" ? 7 : frequency === "BIWEEKLY" ? 14 : null;

  while (current <= until) {
    dates.push(new Date(current));

    if (incrementDays !== null) {
      current = new Date(current);
      current.setDate(current.getDate() + incrementDays);
    } else {
      // MONTHLY
      current = new Date(current);
      current.setMonth(current.getMonth() + 1);
    }
  }

  return dates;
}
