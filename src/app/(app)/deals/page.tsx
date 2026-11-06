import { blockServiceManager } from "@/lib/service-access";
import { SALES_TITLE_IN } from "@/lib/team-titles";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds, isBackOffice } from "@/lib/rbac";
import { PageHeader, NewButton } from "@/components/ui";
import { OPEN_DEAL_STAGES } from "@/lib/constants";
import { KanbanBoard } from "./kanban-board";
import { STALE_DAYS, daysSince, lastContact } from "@/lib/stalled";
import { OwnerFilter } from "./owner-filter";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  await blockServiceManager();
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);
  const params = await searchParams;
  const ownerFilter = { in: params.owner ? [params.owner] : ownerIds };

  const deals = await prisma.deal.findMany({
    where: { ownerId: ownerFilter, stage: { in: OPEN_DEAL_STAGES } },
    orderBy: { updatedAt: "desc" },
    include: {
      owner: { select: { name: true, avatarColor: true } },
      account: { select: { name: true } },
      _count: { select: { items: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 5, select: { createdAt: true, completedAt: true, status: true, dueAt: true } },
    },
  });
  // No customer contact for STALE_DAYS (stalled.ts): flagged on the card.
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const noContactDays = (d: (typeof deals)[number]) => {
    if (d.activities.some((a) => a.status === "PENDING" && a.dueAt && a.dueAt >= today)) return null;
    const days = daysSince(lastContact(d), now);
    return days >= STALE_DAYS ? days : null;
  };

  // The current 6 active core sales reps, plus Sikiru (Service Manager) -
  // not the full historical SALES_MANAGER-role roster.
  const owners = isBackOffice(user)
    ? await prisma.user.findMany({
        where: { isActive: true, OR: [{ title: SALES_TITLE_IN }, { title: "Service Manager" }] },
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
          // Won & lost deals and their insights: Sales Register > Won & lost deals.
          <NewButton href="/deals/new" label="New Deal" />
        }
      />
      <div className="p-6">
        {isBackOffice(user) && owners.length > 0 && (
          <OwnerFilter owners={owners} value={params.owner ?? ""} />
        )}
        <KanbanBoard deals={deals.map(({ activities: _a, ...d }) => ({ ...d, itemCount: d._count.items, noContactDays: noContactDays({ ...d, activities: _a }) }))} />
      </div>
    </div>
  );
}
