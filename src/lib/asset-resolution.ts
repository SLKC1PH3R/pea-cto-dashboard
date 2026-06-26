import { prisma } from "@/lib/prisma";
import { resolveAssetByIsin, resolveAssetName, type KnownAsset } from "@/lib/parsers/asset-mapping";

/**
 * Étend la résolution statique (asset-mapping.ts) avec les mappings que
 * l'utilisateur a renseignés lui-même via la page "Actifs non reconnus"
 * (`CustomAssetMapping`) — sans ça, un fonds non couvert par la table
 * statique reste à mapper manuellement à chaque import. Priorité : ISIN
 * connu (statique) > nom connu (statique) > ISIN custom > nom custom.
 */
export async function resolveAssetWithCustom(
  userId: string,
  rawName: string,
  isin: string | null
): Promise<KnownAsset | null> {
  const byIsin = isin ? resolveAssetByIsin(isin) : null;
  if (byIsin?.matched) return byIsin.asset;

  const byName = resolveAssetName(rawName);
  if (byName.matched) return byName.asset;

  const customs = await prisma.customAssetMapping.findMany({ where: { userId } });
  const normalized = rawName.toUpperCase();

  const byCustomIsin = isin ? customs.find((c) => c.isin?.toUpperCase() === isin.toUpperCase()) : undefined;
  const byCustomName = byCustomIsin ?? customs.find((c) => normalized.includes(c.rawName.toUpperCase()));
  if (!byCustomName) return null;

  return {
    matchFragments: [byCustomName.rawName],
    ticker: byCustomName.ticker,
    isin: byCustomName.isin ?? undefined,
    name: byCustomName.name,
    assetType: byCustomName.assetType,
    sector: byCustomName.sector ?? undefined,
    region: byCustomName.region ?? undefined,
    currency: byCustomName.currency,
  };
}

/**
 * Journalise un nom d'actif non résolu (ni table statique, ni mapping
 * personnalisé, ni suggestion tradingview.com) — visible ensuite dans la
 * page "Actifs non reconnus" pour que l'utilisateur le mappe une bonne fois.
 */
export async function logUnknownAsset(userId: string, rawName: string, isin: string | null): Promise<void> {
  await prisma.unknownAsset.upsert({
    where: { userId_rawName: { userId, rawName } },
    update: { occurrences: { increment: 1 }, lastSeenAt: new Date(), ...(isin ? { isin } : {}) },
    create: { userId, rawName, isin },
  });
}
