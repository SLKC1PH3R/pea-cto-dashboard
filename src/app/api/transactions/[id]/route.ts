import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * Permet d'ajuster une transaction existante — typiquement pour confirmer
 * une projection DCA avec le prix/quantité réel une fois connu, ou corriger
 * une transaction importée par erreur.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Vérifie que la transaction appartient bien à l'utilisateur (via la chaîne position -> account -> user)
  const existing = await prisma.transaction.findFirst({
    where: { id, position: { account: { userId: session.user.id } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Transaction introuvable" }, { status: 404 });
  }

  const body = await req.json();
  const { quantity, price, fees, date, status } = body;

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      ...(quantity !== undefined ? { quantity } : {}),
      ...(price !== undefined ? { price } : {}),
      ...(fees !== undefined ? { fees } : {}),
      ...(date !== undefined ? { date: new Date(date) } : {}),
      ...(status !== undefined ? { status } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const existing = await prisma.transaction.findFirst({
    where: { id, position: { account: { userId: session.user.id } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Transaction introuvable" }, { status: 404 });
  }

  await prisma.transaction.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
