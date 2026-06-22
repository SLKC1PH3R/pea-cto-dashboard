import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDashboardData } from "@/lib/dashboard-data";
import { AtelierDashboard } from "@/components/dashboard/AtelierDashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  // Le statut `onboarded` est vérifié en base par le proxy (src/proxy.ts) à
  // chaque requête — pas de re-check ici sur le claim JWT, qui peut rester
  // périmé après une mise à jour du profil.

  const [data, accounts] = await Promise.all([
    getDashboardData(session.user.id, session.user.email),
    prisma.account.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true, type: true, broker: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return <AtelierDashboard data={data} accounts={accounts} signOutAction={handleSignOut} />;
}
