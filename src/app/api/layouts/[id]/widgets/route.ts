import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const layoutId = params.id;
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
