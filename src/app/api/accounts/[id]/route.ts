import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const account = await prisma.account.findFirst({ where: { id, userId: session.user.id } });
  if (!account) {
    return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  }

  const body = await req.json();
  const { name, type, broker } = body;
  if (!name || !type) {
    return NextResponse.json({ error: "Champs requis: name, type" }, { status: 400 });
  }

  const updated = await prisma.account.update({
    where: { id },
    data: { name, type, broker: broker ?? null },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const account = await prisma.account.findFirst({ where: { id, userId: session.user.id } });
  if (!account) {
    return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  }

  await prisma.account.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
