import Link from "next/link";
import { ListChecks } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { addActivity } from "../shared-actions";
import { ActivitiesList } from "./activities-list";
import { QuickAddActivity } from "./quick-add-activity";

export default async function ActivitiesPage() {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);

  const [activities, owners, accounts, contacts] = await Promise.all([
    prisma.activity.findMany({
      where: { ownerId: { in: ownerIds } },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      include: {
        owner: { select: { name: true, avatarColor: true } },
        lead: { select: { id: true, title: true } },
        deal: { select: { id: true, title: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        account: { select: { id: true, name: true } },
      },
    }),
    user.role === "HEAD"
      ? prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.account.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true, name: true } }),
    prisma.contact.findMany({
      where: { ownerId: { in: ownerIds } },
      select: { id: true, firstName: true, lastName: true, accountId: true },
    }),
  ]);

  // No fixed owner/contact/account here (unlike Record Timeline's binding on
  // a specific record) - the quick-add form below submits whichever ones
  // were picked, or none.
  const addStandaloneActivity = addActivity.bind(null, {});

  return (
    <div>
      <PageHeader
        title="Activities"
        description="Calls, meetings, emails and tasks across your sales cycle"
        action={
          <Link
            href="/activities/queue"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3.5 py-2 transition-colors"
          >
            <ListChecks className="h-4 w-4" />
            Work my queue
          </Link>
        }
      />

      <div className="p-6 space-y-4">
        <Card className="p-4">
          <QuickAddActivity
            action={addStandaloneActivity}
            isHead={user.role === "HEAD"}
            owners={owners.map((o) => ({ id: o.id, label: o.name }))}
            accounts={accounts.map((a) => ({ id: a.id, label: a.name }))}
            contacts={contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, accountId: c.accountId }))}
          />
        </Card>

        <ActivitiesList activities={activities} owners={owners} isHead={user.role === "HEAD"} />
      </div>
    </div>
  );
}
