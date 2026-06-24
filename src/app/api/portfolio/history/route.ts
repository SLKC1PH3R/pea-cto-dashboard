import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPositionsHistoryForDate } from "@/lib/portfolio-history";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get("date");
  if (!date || Number.isNaN(new Date(date).getTime())) {
    return NextResponse.json({ error: "Paramètre date invalide (attendu YYYY-MM-DD)" }, { status: 400 });
  }

  const result = await getPositionsHistoryForDate(session.user.id, date);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
