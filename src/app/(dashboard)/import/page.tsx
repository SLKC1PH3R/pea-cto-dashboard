import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ImportDropzone } from "@/components/import/ImportDropzone";
import { ManualTransactionForm } from "@/components/import/ManualTransactionForm";
import { DcaRuleForm } from "@/components/import/DcaRuleForm";
import Link from "next/link";

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
    <main className="min-h-screen p-6" style={{ background: "#ece2cf" }}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl text-[#2b2620]">Ajouter des transactions</h1>
            <p className="text-sm text-[#8a7a5f]">Par import PDF ou saisie manuelle</p>
          </div>
          <Link href="/dashboard" className="text-sm text-[#8a7a5f] hover:underline">
            ← Retour au dashboard
          </Link>
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#d8cbb0] bg-[#fbf8f1] p-8 text-center">
            <p className="text-sm text-[#6b5f48]">
              Tu n'as pas encore de compte. Crée d'abord un compte (PEA ou CTO) avant d'ajouter des transactions.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl border border-[#d8cbb0] bg-[#fbf8f1] p-6">
              <h2 className="mb-1 font-serif text-lg text-[#2b2620]">Import PDF</h2>
              <p className="mb-4 text-xs text-[#8a7a5f]">
                Confirmations Boursorama — glisse-dépose plusieurs fichiers à la fois
              </p>
              <ImportDropzone accounts={accounts} />
            </section>

            <section className="rounded-2xl border border-[#d8cbb0] bg-[#fbf8f1] p-6">
              <h2 className="mb-1 font-serif text-lg text-[#2b2620]">Saisie manuelle</h2>
              <p className="mb-4 text-xs text-[#8a7a5f]">
                Pour les transactions Trade Republic ou tout actif non couvert par l'import PDF
              </p>
              <ManualTransactionForm accounts={accounts} />
            </section>

            <section className="rounded-2xl border border-[#d8cbb0] bg-[#fbf8f1] p-6">
              <h2 className="mb-1 font-serif text-lg text-[#2b2620]">Plan d'investissement programmé (DCA)</h2>
              <p className="mb-4 text-xs text-[#8a7a5f]">
                Pour les plans récurrents Trade Republic — génère automatiquement les exécutions
                passées en projection
              </p>
              <DcaRuleForm accounts={accounts} />
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
