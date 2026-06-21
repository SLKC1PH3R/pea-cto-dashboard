import { prisma } from "@/lib/prisma";
import { generateDcaExecutionDates } from "@/lib/finance-calculations";
import { getQuote } from "@/lib/finnhub";

/**
 * Génère les exécutions PROJECTED manquantes d'une règle DCA active, entre
 * sa première exécution et aujourd'hui — sans jamais recréer une date déjà
 * présente (idempotent, peut être rappelé à chaque chargement du dashboard
 * sans dupliquer les lignes). Une règle en pause (`active: false`) n'est
 * jamais synchronisée : ses exécutions s'arrêtent là où l'utilisateur l'a
 * mise en pause, jusqu'à ce qu'il la reprenne.
 */
export async function syncDcaRule(ruleId: string): Promise<{ created: number }> {
  const rule = await prisma.dcaRule.findUnique({
    where: { id: ruleId },
    include: { asset: true, transactions: true },
  });
  if (!rule || !rule.active) return { created: 0 };

  const existingDates = new Set(rule.transactions.map((t) => t.date.toISOString().slice(0, 10)));
  const allDates = generateDcaExecutionDates(rule.firstExecution, rule.frequency, new Date());
  const missingDates = allDates.filter((d) => !existingDates.has(d.toISOString().slice(0, 10)));
  if (missingDates.length === 0) return { created: 0 };

  const position = await prisma.position.upsert({
    where: { accountId_assetId: { accountId: rule.accountId, assetId: rule.assetId } },
    update: {},
    create: { accountId: rule.accountId, assetId: rule.assetId },
  });

  let approxPrice = 1;
  try {
    const quote = await getQuote(rule.asset.ticker);
    approxPrice = quote.c > 0 ? quote.c : 1;
  } catch {
    // Finnhub indisponible pour ce ticker — fallback à 1, l'utilisateur
    // pourra ajuster la quantité manuellement comme pour les projections
    // initiales.
  }

  const amount = rule.amount.toNumber();

  await prisma.$transaction(
    missingDates.map((date) =>
      prisma.transaction.create({
        data: {
          positionId: position.id,
          type: "BUY",
          status: "PROJECTED",
          quantity: amount / approxPrice,
          price: approxPrice,
          fees: 0,
          date,
          dcaRuleId: rule.id,
          note: "Projection DCA — quantité approximative, à ajuster avec le prix réel",
        },
      })
    )
  );

  return { created: missingDates.length };
}

/** Synchronise toutes les règles DCA actives d'un utilisateur. */
export async function syncAllActiveDcaRules(userId: string): Promise<void> {
  const rules = await prisma.dcaRule.findMany({ where: { userId, active: true }, select: { id: true } });
  for (const rule of rules) {
    await syncDcaRule(rule.id);
  }
}
