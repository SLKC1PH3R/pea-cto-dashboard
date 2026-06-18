import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth, signOut } from "@/lib/auth";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";

async function getOrCreateDefaultLayout(userId: string) {
  let layout = await prisma.dashboardLayout.findFirst({
    where: { userId, isDefault: true },
    include: { widgets: true },
  });

  if (!layout) {
    layout = await prisma.dashboardLayout.create({
      data: {
        userId,
        name: "Mon dashboard",
        isDefault: true,
        widgets: {
          create: [
            { type: "TOTAL_VALUE", x: 0, y: 0, w: 3, h: 2 },
            { type: "FEES_SUMMARY", x: 3, y: 0, w: 3, h: 2 },
            { type: "POSITIONS_TABLE", x: 0, y: 2, w: 8, h: 5 },
          ],
        },
      },
      include: { widgets: true },
    });
  }

  return layout;
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const layout = await getOrCreateDefaultLayout(session.user.id);

  const widgets = layout.widgets.map((w) => ({
    id: w.id,
    type: w.type,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
    config: (w.config as Record<string, unknown>) ?? undefined,
  }));

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Connecté en tant que {session.user.email}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="text-sm text-gray-500 hover:text-red-600">
              Se déconnecter
            </button>
          </form>
        </div>
        <DashboardGrid layoutId={layout.id} initialWidgets={widgets} />
      </div>
    </main>
  );
}
