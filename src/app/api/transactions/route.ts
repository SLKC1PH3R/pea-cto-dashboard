import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const transactions = await prisma.transaction.findMany({
    where: { position: { account: { userId: session.user.id } } },
    include: { position: { include: { asset: true, account: true } } },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(
    transactions.map((t) => ({
      id: t.id,
      date: t.date.toISOString().slice(0, 10),
      type: t.type,
      quantity: t.quantity.toNumber(),
      price: t.price.toNumber(),
      fees: t.fees.toNumber(),
      note: t.note,
      status: t.status,
      sourceDocument: t.sourceDocument,
      accountName: t.position.account.name,
      assetName: t.position.asset.name,
      assetTicker: t.position.asset.ticker,
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json();
  const { accountId, ticker, assetName, assetType, currency, type, quantity, price, fees, date } = body;

  if (!accountId || !ticker || !assetName || !type || !quantity || !price || !date) {
    return NextResponse.json(
      { error: "Champs requis: accountId, ticker, assetName, type, quantity, price, date" },
      { status: 400 }
    );
  }

  // Vérifie que le compte appartient à l'utilisateur connecté
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: session.user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  }

  // Upsert de l'actif (création à la volée si nouveau ticker saisi manuellement)
  const asset = await prisma.asset.upsert({
    where: { ticker },
    update: {},
    create: {
      ticker,
      name: assetName,
      assetType: assetType ?? "ACTION",
      currency: currency ?? account.currency,
    },
  });

  const position = await prisma.position.upsert({
    where: { accountId_assetId: { accountId, assetId: asset.id } },
    update: {},
    create: { accountId, assetId: asset.id },
  });

  const transaction = await prisma.transaction.create({
    data: {
      positionId: position.id,
      type,
      status: "CONFIRMED",
      quantity,
      price,
      fees: fees ?? 0,
      date: new Date(date),
      note: "Saisie manuelle",
    },
  });

  return NextResponse.json(transaction, { status: 201 });
}
