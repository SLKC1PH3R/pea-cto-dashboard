import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateApiToken, hashApiToken } from "@/lib/api-token";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const token = await prisma.apiToken.findFirst({
    where: { userId: session.user.id },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
  });

  return NextResponse.json({ token });
}

// Un seul token actif par utilisateur pour l'instant (v1 popup + badge) — en
// générer un nouveau révoque l'ancien, pas de gestion multi-appareils encore.
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const rawToken = generateApiToken();
  const tokenHash = hashApiToken(rawToken);

  await prisma.$transaction([
    prisma.apiToken.deleteMany({ where: { userId: session.user.id } }),
    prisma.apiToken.create({ data: { userId: session.user.id, tokenHash } }),
  ]);

  // Le token brut n'est renvoyé qu'ici, une seule fois — il n'est jamais
  // récupérable ensuite (seul son hash est stocké).
  return NextResponse.json({ token: rawToken });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  await prisma.apiToken.deleteMany({ where: { userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
