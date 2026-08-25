import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, NewButton } from "@/components/ui";
import { OPEN_DEAL_STAGES } from "@/lib/constants";
import { KanbanBoard } from "./kanban-board";
import { OwnerFilter } from "./owner-filter";

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

  const owners = user.role === "HEAD"
    ? await prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
    : [];

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Drag deals between stages to update their status"
        action={
          <div className="flex items-center gap-3">
            <Link href="/deals/closed" className="text-sm text-indigo-600 hover:text-indigo-700">
              {closedCount} closed deal{closedCount === 1 ? "" : "s"} →
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
