import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, NewButton } from "@/components/ui";
import { OPEN_DEAL_STAGES } from "@/lib/constants";
import { KanbanBoard } from "./kanban-board";
import { OwnerFilter } from "./owner-filter";
import { BarChart3 } from "lucide-react";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);
  const params = await searchParams;
  const ownerFilter = { in: params.owner ? [params.owner] : ownerIds };

  const [deals, closedCount] = await Promise.all([
    prisma.deal.findMany({
      where: { ownerId: ownerFilter, stage: { in: OPEN_DEAL_STAGES } },
      orderBy: { updatedAt: "desc" },
      include: {
        owner: { select: { name: true, avatarColor: true } },
        account: { select: { name: true } },
      },
    }),
    prisma.deal.count({ where: { ownerId: ownerFilter, stage: { in: ["WON", "LOST"] } } }),
  ]);

  // The current 6 active core sales reps, plus Sikiru (Service Manager) -
  // not the full historical SALES_MANAGER-role roster.
  const owners = user.role === "HEAD"
    ? await prisma.user.findMany({
        where: { isActive: true, OR: [{ title: "Sales Manager" }, { title: "Service Manager" }] },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Drag deals between stages to update their status"
        action={
          <div className="flex items-center gap-3">
            <Link
              href="/deals/closed"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
            >
              <BarChart3 className="h-4 w-4" />
              {closedCount} Closed Deal{closedCount === 1 ? "" : "s"} & Insights
            </Link>
            <NewButton href="/deals/new" label="New Deal" />
          </div>
        }
      />
      <div className="p-6">
        {user.role === "HEAD" && owners.length > 0 && (
          <OwnerFilter owners={owners} value={params.owner ?? ""} />
        )}
        <KanbanBoard deals={deals} />
      </div>
    </div>
  );
}
