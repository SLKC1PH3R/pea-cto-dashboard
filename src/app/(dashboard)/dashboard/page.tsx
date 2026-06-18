import { redirect } from "next/navigation";
// import { prisma } from "@/lib/prisma";
import { auth, signOut } from "@/lib/auth";
import { AtelierDashboard } from "@/components/dashboard/AtelierDashboard";
import { buildDashboardData } from "@/components/dashboard/atelier-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // TODO : brancher vos vraies données ici.
  // `buildDashboardData` renvoie un jeu de démonstration ; il suffit de
  // remplacer les champs par vos requêtes Prisma / agrégations.
  //
  //   const layout = await prisma.dashboardLayout.findFirst({ ... });
  //   const positions = await prisma.position.findMany({ ... });
  //   const data = buildDashboardData({
  //     email: session.user.email ?? "",
  //     total: ...,
  //     positions: positions.map(...),
  //     ...
  //   });
  const data = buildDashboardData({ email: session.user.email ?? "" });

  // Server Action transmise au composant client pour la déconnexion.
  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return <AtelierDashboard data={data} signOutAction={handleSignOut} />;
}
