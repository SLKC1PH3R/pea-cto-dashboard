import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parsePerformanceCsv } from "@/lib/parsers/performance-csv";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const formData = await req.formData();
  const accountId = formData.get("accountId");
  const file = formData.get("file");
  if (typeof accountId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const account = await prisma.account.findFirst({ where: { id: accountId, userId: session.user.id } });
  if (!account) {
    return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  }

  const text = await file.text();
  const rows = parsePerformanceCsv(text);
  if (rows.length === 0) {
    return NextResponse.json({ error: "Aucune ligne valide détectée dans le fichier (colonnes Date / Valorisation attendues)" }, { status: 400 });
  }

  await prisma.$transaction(
    rows.map((r) =>
      prisma.portfolioSnapshot.upsert({
        where: { accountId_date: { accountId, date: r.date } },
        update: { value: r.value, cumulativeReturnPct: r.cumulativeReturnPct },
        create: { accountId, date: r.date, value: r.value, cumulativeReturnPct: r.cumulativeReturnPct },
      })
    )
  );

  return NextResponse.json({ ok: true, count: rows.length });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { accountId } = await req.json();
  if (typeof accountId !== "string") {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const account = await prisma.account.findFirst({ where: { id: accountId, userId: session.user.id } });
  if (!account) {
    return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  }

  await prisma.portfolioSnapshot.deleteMany({ where: { accountId } });
  return NextResponse.json({ ok: true });
}
