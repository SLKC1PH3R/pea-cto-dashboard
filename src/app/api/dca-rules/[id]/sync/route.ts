import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { syncDcaRule } from "@/lib/dca-sync";

/**
 * Génère manuellement les exécutions manquantes d'une règle DCA (utile pour
 * vérifier tout de suite plutôt que d'attendre la prochaine visite du
 * dashboard, qui synchronise déjà automatiquement chaque plan actif).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const existing = await prisma.dcaRule.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) {
    return NextResponse.json({ error: "Plan introuvable" }, { status: 404 });
  }
  if (!existing.active) {
    return NextResponse.json({ error: "Ce plan est en pause — reprends-le avant de synchroniser" }, { status: 400 });
  }

  const result = await syncDcaRule(id);
  return NextResponse.json(result);
}
