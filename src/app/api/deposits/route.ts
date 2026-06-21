import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const deposits = await prisma.deposit.findMany({
    where: { account: { userId: session.user.id } },
    include: { account: true },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(
    deposits.map((d) => ({
      id: d.id,
      date: d.date.toISOString().slice(0, 10),
      amount: d.amount.toNumber(),
      note: d.note,
      accountName: d.account.name,
    }))
  );
}
