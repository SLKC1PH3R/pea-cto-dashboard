import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const MAX_AVATAR_LENGTH = 300_000; // ~225 Ko décodé, suffisant pour une petite vignette

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json();
  const { name, avatarColor, avatarUrl, birthDate, fireAge } = body as {
    name?: string;
    avatarColor?: string | null;
    avatarUrl?: string | null;
    birthDate?: string | null;
    fireAge?: number | null;
  };

  if (avatarUrl && avatarUrl.length > MAX_AVATAR_LENGTH) {
    return NextResponse.json({ error: "Image trop lourde — choisis une image plus petite" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(name !== undefined ? { name: name.trim() || null } : {}),
      ...(avatarColor !== undefined ? { avatarColor } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      ...(birthDate !== undefined ? { birthDate: birthDate ? new Date(birthDate) : null } : {}),
      ...(fireAge !== undefined ? { fireAge } : {}),
    },
  });

  return NextResponse.json({
    name: user.name,
    avatarColor: user.avatarColor,
    avatarUrl: user.avatarUrl,
    birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
    fireAge: user.fireAge,
  });
}
