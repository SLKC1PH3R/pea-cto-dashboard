import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { MarketsBrowser } from "@/components/markets/MarketsBrowser";
import { PALETTE } from "@/components/dashboard/atelier-data";

export const dynamic = "force-dynamic";

export default async function MarchesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (!session.user.onboarded) {
    redirect("/onboarding");
  }

  const watchlist = await prisma.watchlistItem.findMany({
    where: { userId: session.user.id },
    select: { ticker: true },
  });

  return (
    <main
      className="min-h-screen p-6"
      style={{ ...PALETTE.dark, background: "var(--bg)", color: "var(--fg)", fontFamily: "var(--font-body, 'Plus Jakarta Sans', system-ui)" }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[19px] font-extrabold tracking-tight text-[var(--fg)]">Marchés</h1>
            <p className="text-[13px] text-[var(--fg2)]">Cherche une action ou un ETF et ajoute-le à ta watchlist</p>
          </div>
          <DashboardNav />
        </div>

        <MarketsBrowser initialWatchlist={watchlist.map((w) => w.ticker)} />
      </div>
    </main>
  );
}
