import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const items = await prisma.watchlistItem.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json();
  const ticker = (body.ticker as string | undefined)?.trim().toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "ticker requis" }, { status: 400 });
  }

  const item = await prisma.watchlistItem.upsert({
    where: { userId_ticker: { userId: session.user.id, ticker } },
    update: {},
    create: { userId: session.user.id, ticker, name: body.name ?? null },
  });

  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const ticker = req.nextUrl.searchParams.get("ticker")?.trim().toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "ticker requis" }, { status: 400 });
  }

  await prisma.watchlistItem.deleteMany({
    where: { userId: session.user.id, ticker },
  });

  return NextResponse.json({ ok: true });
}
