import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/** Met en pause / reprend une règle DCA — aucune exécution n'est générée tant qu'elle est en pause. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const existing = await prisma.dcaRule.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) {
    return NextResponse.json({ error: "Plan introuvable" }, { status: 404 });
  }

  const body = await req.json();
  const { active } = body as { active?: boolean };

  const updated = await prisma.dcaRule.update({
    where: { id },
    data: { ...(active !== undefined ? { active } : {}) },
  });

  return NextResponse.json({ id: updated.id, active: updated.active });
}
