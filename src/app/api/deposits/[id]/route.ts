import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const existing = await prisma.deposit.findFirst({
    where: { id, account: { userId: session.user.id } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Dépôt introuvable" }, { status: 404 });
  }

  const body = await req.json();
  const { amount, date, note } = body;

  const updated = await prisma.deposit.update({
    where: { id },
    data: {
      ...(amount !== undefined ? { amount } : {}),
      ...(date !== undefined ? { date: new Date(date) } : {}),
      ...(note !== undefined ? { note } : {}),
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

  const existing = await prisma.deposit.findFirst({
    where: { id, account: { userId: session.user.id } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Dépôt introuvable" }, { status: 404 });
  }

  await prisma.deposit.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
