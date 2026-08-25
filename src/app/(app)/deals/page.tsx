import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, NewButton } from "@/components/ui";
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

  const deals = await prisma.deal.findMany({
    where: { ownerId: { in: params.owner ? [params.owner] : ownerIds } },
    orderBy: { updatedAt: "desc" },
    include: {
      owner: { select: { name: true, avatarColor: true } },
      account: { select: { name: true } },
    },
  });

  const owners = user.role === "HEAD"
    ? await prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
    : [];

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Drag deals between stages to update their status"
        action={<NewButton href="/deals/new" label="New Deal" />}
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
