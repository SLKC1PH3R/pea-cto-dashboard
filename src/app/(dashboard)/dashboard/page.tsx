import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard-data";
import { AtelierDashboard } from "@/components/dashboard/AtelierDashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (!session.user.onboarded) {
    redirect("/onboarding");
  }

  const data = await getDashboardData(session.user.id, session.user.email);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return <AtelierDashboard data={data} signOutAction={handleSignOut} />;
}
