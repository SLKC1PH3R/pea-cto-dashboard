import { prisma } from "@/lib/prisma";

/**
 * Recherche une exécution DCA PROJECTED (quantité/prix approximatifs, cf.
 * dca-sync.ts) sur la même position, à une date proche d'un achat réel en
 * cours d'import. Une projection DCA est générée à la date d'exécution
 * théorique de la règle ; le règlement réel (relevé Boursorama/Trade
 * Republic) peut tomber quelques jours avant ou après — tolérance large
 * (±10 jours) car les règles DCA sont mensuelles/hebdomadaires et ce délai
 * reste sans ambiguïté avec l'exécution suivante.
 */
export async function findReconcilableProjected(positionId: string, date: Date) {
  const toleranceMs = 10 * 24 * 60 * 60 * 1000;
  return prisma.transaction.findFirst({
    where: {
      positionId,
      status: "PROJECTED",
      type: "BUY",
      date: { gte: new Date(date.getTime() - toleranceMs), lte: new Date(date.getTime() + toleranceMs) },
    },
    orderBy: { date: "asc" },
  });
}
