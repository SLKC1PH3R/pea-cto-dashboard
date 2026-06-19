import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard-data";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { GoalForm } from "@/components/objectifs/GoalForm";
import { PALETTE, buildRing, eur, nf } from "@/components/dashboard/atelier-data";

export const dynamic = "force-dynamic";

export default async function ObjectifsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (!session.user.onboarded) {
    redirect("/onboarding");
  }

  const data = await getDashboardData(session.user.id, session.user.email);
  const goalPct = data.goal ? (data.total / data.goal) * 100 : 0;
  const ringDash = buildRing(goalPct);

  return (
    <main
      className="min-h-screen p-6"
      style={{ ...PALETTE.dark, background: "var(--bg)", color: "var(--fg)", fontFamily: "var(--font-body, 'Plus Jakarta Sans', system-ui)" }}
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[19px] font-extrabold tracking-tight text-[var(--fg)]">Objectifs</h1>
            <p className="text-[13px] text-[var(--fg2)]">Définis un objectif de patrimoine et suis ta progression</p>
          </div>
          <DashboardNav />
        </div>

        <div className="grid grid-cols-12 gap-[18px]">
          <section className="col-span-5 rounded-[22px] border p-6" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
            <h2 className="mb-4 text-[17px] font-bold text-[var(--fg)]">Progression</h2>
            {data.goal ? (
              <div className="flex items-center gap-[18px]">
                <div className="relative h-24 w-24 flex-none">
                  <svg width="96" height="96" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--track)" strokeWidth="12" />
                    <circle cx="60" cy="60" r="52" fill="none" style={{ stroke: "var(--accent)" }} strokeWidth="12" strokeLinecap="round" strokeDasharray={ringDash} transform="rotate(-90 60 60)" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-[18px] font-bold text-[var(--fg)]">
                    {nf(goalPct, 1)} %
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-[11px]">
                  <div className="flex flex-col">
                    <span className="text-[11.5px] text-[var(--fg2)]">Valeur actuelle</span>
                    <span className="text-[17px] font-bold text-[var(--fg)]">{eur(data.total)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11.5px] text-[var(--fg2)]">Reste à atteindre</span>
                    <span className="text-[17px] font-bold text-[var(--fg)]">{eur(Math.max(data.goal - data.total, 0))}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-[var(--fg2)]">
                Pas encore d'objectif défini — fixe un montant cible ci-contre pour suivre ta progression.
              </p>
            )}
          </section>

          <section className="col-span-7 rounded-[22px] border p-6" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
            <h2 className="mb-4 text-[17px] font-bold text-[var(--fg)]">Modifier l&apos;objectif</h2>
            <GoalForm initialGoal={data.goal} />
          </section>
        </div>
      </div>
    </main>
  );
}
