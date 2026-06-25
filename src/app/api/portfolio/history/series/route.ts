import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPortfolioValueSeries } from "@/lib/portfolio-history";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to || Number.isNaN(new Date(from).getTime()) || Number.isNaN(new Date(to).getTime())) {
    return NextResponse.json({ error: "Paramètres from/to invalides (attendu YYYY-MM-DD)" }, { status: 400 });
  }

  const result = await getPortfolioValueSeries(session.user.id, from, to);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
