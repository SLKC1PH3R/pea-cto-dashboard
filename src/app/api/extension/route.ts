import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashApiToken } from "@/lib/api-token";
import { getDashboardData } from "@/lib/dashboard-data";

/**
 * Endpoint dédié à l'extension navigateur — volontairement hors du
 * périmètre du proxy de session (src/proxy.ts) : l'extension n'a pas accès
 * au cookie Next-Auth (autre contexte d'origine), elle s'authentifie donc
 * avec un token personnel ("Authorization: Bearer ...", généré depuis les
 * réglages du profil). Ne renvoie qu'un résumé minimal, jamais le détail des
 * positions/transactions.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Token manquant" }, { status: 401 });
  }

  const apiToken = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(token) },
    select: { userId: true, id: true },
  });
  if (!apiToken) {
    return NextResponse.json({ error: "Token invalide" }, { status: 401 });
  }

  await prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } });

  const user = await prisma.user.findUnique({ where: { id: apiToken.userId }, select: { email: true } });
  const data = await getDashboardData(apiToken.userId, user?.email ?? null);

  const byDay = [...data.positions].sort((a, b) => b.day - a.day);
  const topGainer = byDay[0];
  const topLoser = byDay[byDay.length - 1];

  return NextResponse.json(
    {
      portfolioValue: Math.round(data.total * 100) / 100,
      dailyChange: Math.round(data.dayAbs * 100) / 100,
      dailyPercent: Math.round(data.dayPct * 100) / 100,
      topGainer: topGainer ? { ticker: topGainer.ticker, name: topGainer.name, pct: topGainer.day } : null,
      topLoser:
        topLoser && topLoser !== topGainer ? { ticker: topLoser.ticker, name: topLoser.name, pct: topLoser.day } : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
