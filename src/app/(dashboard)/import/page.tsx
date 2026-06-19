import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ImportDropzone } from "@/components/import/ImportDropzone";
import { ManualTransactionForm } from "@/components/import/ManualTransactionForm";
import { DcaRuleForm } from "@/components/import/DcaRuleForm";
import { AccountManager } from "@/components/import/AccountManager";
import { TransactionsManager } from "@/components/import/TransactionsManager";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { PALETTE } from "@/components/dashboard/atelier-data";

export default async function ImportPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const accounts = await prisma.account.findMany({
    where: { userId: session.user.id },
    select: { id: true, name: true, type: true, broker: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main
      className="min-h-screen p-6"
      style={{ ...PALETTE.dark, background: "var(--bg)", color: "var(--fg)", fontFamily: "var(--font-body, 'Plus Jakarta Sans', system-ui)" }}
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[19px] font-extrabold tracking-tight text-[var(--fg)]">Ajouter des transactions</h1>
            <p className="text-[13px] text-[var(--fg2)]">Par import PDF ou saisie manuelle</p>
          </div>
          <DashboardNav />
        </div>

        <div className="flex flex-col gap-6">
          <AccountManager accounts={accounts} />

          {accounts.length === 0 ? (
            <p className="text-[13px] text-[var(--fg2)]">
              Crée un compte ci-dessus pour pouvoir importer un PDF, saisir une transaction ou créer un plan DCA.
            </p>
          ) : (
            <>
              <section className="rounded-[22px] border p-6" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
                <h2 className="mb-1 text-[17px] font-bold text-[var(--fg)]">Import PDF</h2>
                <p className="mb-4 text-[12.5px] text-[var(--fg2)]">
                  Confirmations Boursorama — glisse-dépose plusieurs fichiers à la fois
                </p>
                <ImportDropzone accounts={accounts} />
              </section>

              <section className="rounded-[22px] border p-6" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
                <h2 className="mb-1 text-[17px] font-bold text-[var(--fg)]">Saisie manuelle</h2>
                <p className="mb-4 text-[12.5px] text-[var(--fg2)]">
                  Pour les transactions Trade Republic ou tout actif non couvert par l'import PDF
                </p>
                <ManualTransactionForm accounts={accounts} />
              </section>

              <section className="rounded-[22px] border p-6" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
                <h2 className="mb-1 text-[17px] font-bold text-[var(--fg)]">Plan d&apos;investissement programmé (DCA)</h2>
                <p className="mb-4 text-[12.5px] text-[var(--fg2)]">
                  Pour les plans récurrents Trade Republic — génère automatiquement les exécutions
                  passées en projection
                </p>
                <DcaRuleForm accounts={accounts} />
              </section>
            </>
          )}

          <section className="rounded-[22px] border p-6" style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}>
            <h2 className="mb-1 text-[17px] font-bold text-[var(--fg)]">Transactions enregistrées</h2>
            <p className="mb-4 text-[12.5px] text-[var(--fg2)]">Modifie ou supprime une ligne en cas d'erreur d'import ou de saisie</p>
            <TransactionsManager />
          </section>
        </div>
      </div>
    </main>
  );
}
