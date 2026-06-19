import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json();
  const goalAmount = body.goalAmount as number | null;

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { goalAmount: goalAmount && goalAmount > 0 ? goalAmount : null },
  });

  return NextResponse.json({ goalAmount: user.goalAmount ? user.goalAmount.toNumber() : null });
}
