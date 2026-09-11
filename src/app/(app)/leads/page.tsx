import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, NewButton, Card } from "@/components/ui";
import { LeadsTable } from "./leads-table";

export const maxDuration = 60;

export default async function LeadsPage() {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);

  const [leads, owners] = await Promise.all([
    prisma.lead.findMany({
      where: { ownerId: { in: ownerIds } },
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { id: true, name: true, avatarColor: true } } },
    }),
    user.role === "HEAD"
      ? prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        title="Leads"
        description={`${leads.length} lead${leads.length === 1 ? "" : "s"}`}
        action={<NewButton href="/leads/new" label="New Lead" />}
      />

      <div className="p-6 space-y-4">
        <Card>
          <LeadsTable leads={leads} owners={owners} isHead={user.role === "HEAD"} />
        </Card>
      </div>
    </div>
  );
}
