import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const kind = req.nextUrl.searchParams.get("type"); // "unknown" | "custom"

  if (kind === "custom") {
    await prisma.customAssetMapping.deleteMany({ where: { id, userId: session.user.id } });
  } else {
    await prisma.unknownAsset.deleteMany({ where: { id, userId: session.user.id } });
  }

  return NextResponse.json({ ok: true });
}
