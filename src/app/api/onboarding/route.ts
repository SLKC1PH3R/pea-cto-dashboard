import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const ACCOUNT_LABELS: Record<"PEA" | "CTO", string> = {
  PEA: "PEA",
  CTO: "CTO",
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json();
  const { name, accountTypes, watchlist, goalAmount } = body as {
    name?: string;
    accountTypes?: ("PEA" | "CTO")[];
    watchlist?: string[];
    goalAmount?: number | null;
  };

  const cleanTypes = Array.from(new Set((accountTypes ?? []).filter((t) => t === "PEA" || t === "CTO")));
  const cleanWatchlist = Array.from(
    new Set((watchlist ?? []).map((t) => t.trim().toUpperCase()).filter(Boolean))
  );

  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: name?.trim() || undefined,
        goalAmount: goalAmount && goalAmount > 0 ? goalAmount : null,
        onboarded: true,
      },
    }),
    ...cleanTypes.map((type) =>
      prisma.account.create({
        data: {
          userId: session.user.id,
          name: ACCOUNT_LABELS[type],
          type,
        },
      })
    ),
    ...(cleanWatchlist.length > 0
      ? [
          prisma.watchlistItem.createMany({
            data: cleanWatchlist.map((ticker) => ({ userId: session.user.id, ticker })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true });
}
