import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const [unknown, custom] = await Promise.all([
    prisma.unknownAsset.findMany({ where: { userId: session.user.id }, orderBy: { occurrences: "desc" } }),
    prisma.customAssetMapping.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return NextResponse.json({ unknown, custom });
}

/**
 * Crée un mapping personnalisé pour un nom d'actif non reconnu — les imports
 * suivants (Boursorama, Trade Republic) le résoudront automatiquement (cf.
 * resolveAssetWithCustom dans src/lib/asset-resolution.ts). Supprime aussi
 * l'entrée "non reconnu" correspondante, maintenant résolue.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json();
  const { rawName, ticker, isin, name, assetType, sector, region, currency } = body;
  if (!rawName || !ticker || !name) {
    return NextResponse.json({ error: "Champs requis: rawName, ticker, name" }, { status: 400 });
  }

  const mapping = await prisma.customAssetMapping.upsert({
    where: { userId_rawName: { userId: session.user.id, rawName } },
    update: { ticker, isin: isin || null, name, assetType: assetType ?? "ACTION", sector: sector || null, region: region || null, currency: currency || "EUR" },
    create: {
      userId: session.user.id,
      rawName,
      ticker,
      isin: isin || null,
      name,
      assetType: assetType ?? "ACTION",
      sector: sector || null,
      region: region || null,
      currency: currency || "EUR",
    },
  });

  await prisma.unknownAsset.deleteMany({ where: { userId: session.user.id, rawName } });

  return NextResponse.json(mapping, { status: 201 });
}
