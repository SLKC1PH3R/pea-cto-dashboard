import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard-data";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { PALETTE, buildDonut, eur, signPct, nf } from "@/components/dashboard/atelier-data";

export const dynamic = "force-dynamic";

export default async function PortefeuillePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (!session.user.onboarded) {
    redirect("/onboarding");
  }

  const data = await getDashboardData(session.user.id, session.user.email);
  const donut = buildDonut(data.alloc);

  let sum = 0;
  const rows = data.positions.map((p) => {
    const value = p.qty * p.price;
    sum += value;
    return { ...p, value };
  });
  const withWeight = rows
    .map((p) => ({ ...p, weight: sum > 0 ? (p.value / sum) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  const allocColor = (cls: string) => data.alloc.find((a) => a.label === cls)?.color ?? "var(--fg3)";

  return (
    <main
      className="min-h-screen p-6"
      style={{ ...PALETTE.dark, background: "var(--bg)", color: "var(--fg)", fontFamily: "var(--font-body, 'Plus Jakarta Sans', system-ui)" }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[19px] font-extrabold tracking-tight text-[var(--fg)]">Portefeuille</h1>
            <p className="text-[13px] text-[var(--fg2)]">Toutes tes positions, en détail</p>
          </div>
          <DashboardNav />
        </div>

        {withWeight.length === 0 ? (
          <div className="rounded-[22px] border p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
            <p className="text-[13px] text-[var(--fg2)]">
              Aucune position pour l'instant. Ajoute des transactions depuis la page Importer.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-[18px]">
            <section className="col-span-4 rounded-[22px] border p-6" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
              <h2 className="mb-4 text-[17px] font-bold text-[var(--fg)]">Répartition d'actifs</h2>
              <div className="flex items-center gap-[18px]">
                <div className="relative flex-none">
                  <svg width="128" height="128" viewBox="0 0 200 200">
                    <g transform="rotate(-90 100 100)">
                      {donut.map((s, i) => (
                        <circle key={i} cx="100" cy="100" r="70" fill="none" stroke={s.color} strokeWidth="22" strokeDasharray={s.dash} strokeDashoffset={s.offset} strokeLinecap="round" />
                      ))}
                    </g>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center leading-[1.1]">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--fg3)]">Lignes</span>
                    <span className="text-[20px] font-bold text-[var(--fg)]">{data.positions.length}</span>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {donut.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="h-[9px] w-[9px] flex-none rounded-[3px]" style={{ background: s.color }} />
                      <span className="flex-1 text-[12.5px] text-[var(--fg2)]">{s.label}</span>
                      <span className="text-[12.5px] font-bold text-[var(--fg)]">{s.pctFmt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="col-span-8 overflow-hidden rounded-[22px] border" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
              <div className="flex items-center justify-between px-6 pb-[14px] pt-[22px]">
                <h2 className="text-[17px] font-bold text-[var(--fg)]">Positions</h2>
                <span className="text-[12.5px] text-[var(--fg2)]">{eur(sum)}</span>
              </div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-y border-[var(--line)]">
                    <th className="px-6 py-[9px] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)]">Actif</th>
                    <th className="px-3 py-[9px] text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)]">PRU</th>
                    <th className="px-3 py-[9px] text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)]">Cours</th>
                    <th className="px-3 py-[9px] text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)]">Valeur</th>
                    <th className="px-3 py-[9px] text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)]">Jour</th>
                    <th className="px-6 py-[9px] text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--fg3)]">Poids</th>
                  </tr>
                </thead>
                <tbody>
                  {withWeight.map((p) => (
                    <tr key={p.ticker} className="border-b border-[var(--line)] hover:bg-[var(--panel2)]">
                      <td className="px-6 py-[11px]">
                        <div className="flex items-center gap-[11px]">
                          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] text-[11px] font-bold text-white opacity-90" style={{ background: allocColor(p.cls) }}>
                            {p.cls.slice(0, 2)}
                          </span>
                          <div className="flex flex-col leading-[1.25]">
                            <span className="font-bold text-[var(--fg)]">{p.name}</span>
                            <span className="text-[11px] text-[var(--fg3)]">{p.ticker}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-[11px] text-right text-[var(--fg2)]">{eur(p.pru, 2)}</td>
                      <td className="px-3 py-[11px] text-right text-[var(--fg2)]">{eur(p.price, 2)}</td>
                      <td className="px-3 py-[11px] text-right font-bold text-[var(--fg)]">{eur(p.value)}</td>
                      <td className="px-3 py-[11px] text-right">
                        <span
                          style={{ color: p.day >= 0 ? "var(--pos)" : "var(--neg)", background: p.day >= 0 ? "var(--posbg)" : "var(--negbg)" }}
                          className="rounded-[7px] px-2 py-[3px] text-[12px] font-bold"
                        >
                          {signPct(p.day)}
                        </span>
                      </td>
                      <td className="px-6 py-[11px] text-right text-[var(--fg2)]">{nf(p.weight, 1)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
