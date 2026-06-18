import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { WidgetType, Prisma } from "@prisma/client";

type WidgetInput = {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Record<string, unknown>;
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: layoutId } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Vérifie que ce layout appartient bien à l'utilisateur connecté
  const layout = await prisma.dashboardLayout.findFirst({
    where: { id: layoutId, userId: session.user.id },
  });
  if (!layout) {
    return NextResponse.json({ error: "Layout introuvable" }, { status: 404 });
  }

  const body = await req.json();
  const widgets: WidgetInput[] = body.widgets ?? [];

  // Stratégie simple : on supprime les widgets existants du layout puis on
  // recrée l'ensemble à partir de l'état envoyé par le client. C'est moins
  // optimal qu'un diff fin, mais largement suffisant pour un usage solo et
  // un nombre de widgets restreint (quelques dizaines au plus).
  await prisma.$transaction([
    prisma.widget.deleteMany({ where: { layoutId } }),
    prisma.widget.createMany({
      data: widgets.map((w) => ({
        id: w.id,
        layoutId,
        type: w.type,
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
        config: w.config as Prisma.InputJsonValue,
      })),
    }),
  ]);

  return NextResponse.json({ ok: true });
}
