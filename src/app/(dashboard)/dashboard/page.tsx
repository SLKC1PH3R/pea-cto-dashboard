import { prisma } from "@/lib/prisma";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";

async function getOrCreateDefaultLayout() {
  let layout = await prisma.dashboardLayout.findFirst({
    where: { isDefault: true },
    include: { widgets: true },
  });

  if (!layout) {
    layout = await prisma.dashboardLayout.create({
      data: {
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
  const layout = await getOrCreateDefaultLayout();

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
        <DashboardGrid layoutId={layout.id} initialWidgets={widgets} />
      </div>
    </main>
  );
}
