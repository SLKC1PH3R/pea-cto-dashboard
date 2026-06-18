import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const accounts = await prisma.account.findMany({
    where: { userId: session.user.id },
    include: {
      deposits: true,
      fees: true,
      positions: {
        include: {
          asset: true,
          transactions: true,
          dividends: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json();

  const { name, type, broker, currency, openedAt } = body;

  if (!name || !type || !broker || !openedAt) {
    return NextResponse.json(
      { error: "Champs requis: name, type, broker, openedAt" },
      { status: 400 }
    );
  }

  const account = await prisma.account.create({
    data: {
      userId: session.user.id,
      name,
      type,
      broker,
      currency: currency ?? "EUR",
      openedAt: new Date(openedAt),
    },
  });

  return NextResponse.json(account, { status: 201 });
}
