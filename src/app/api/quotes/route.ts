import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getQuotes } from "@/lib/finnhub";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const tickersParam = req.nextUrl.searchParams.get("tickers");
  const tickers = tickersParam ? [...new Set(tickersParam.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean))] : [];

  if (tickers.length === 0) {
    return NextResponse.json({});
  }

  const quotes = await getQuotes(tickers);
  return NextResponse.json(quotes);
}
