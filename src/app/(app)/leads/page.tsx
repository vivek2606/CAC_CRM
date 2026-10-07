import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds, isBackOffice } from "@/lib/rbac";
import { PageHeader, NewButton, Card } from "@/components/ui";
import Link from "next/link";
import { LeadsTable } from "./leads-table";
import { ActivitiesTab } from "../activities/activities-tab";

export const maxDuration = 60;

// Leads & Activities: the leads list on one tab, calls / meetings / tasks
// on the other.
export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);
  const tab = (await searchParams).tab === "activities" ? "activities" : "leads";
  const tabs = (
    <div className="inline-flex rounded-lg bg-slate-100 p-1">
      {(
        [
          ["leads", "/leads", "Leads"],
          ["activities", "/leads?tab=activities", "Activities"],
        ] as const
      ).map(([key, href, label]) => (
        <Link
          key={key}
          href={href}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );

  if (tab === "activities") {
    return (
      <div>
        <PageHeader
          title="Leads & Activities"
          description="Calls, meetings, emails and tasks across your sales cycle"
          action={<NewButton href="/leads/new" label="New Lead" />}
        />
        <div className="p-6 space-y-4">
          {tabs}
          <ActivitiesTab />
        </div>
      </div>
    );
  }

  const [leads, owners] = await Promise.all([
    prisma.lead.findMany({
      where: { ownerId: { in: ownerIds } },
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { id: true, name: true, avatarColor: true } } },
    }),
    isBackOffice(user)
      ? prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        title="Leads & Activities"
        description={`${leads.length} lead${leads.length === 1 ? "" : "s"}`}
        action={<NewButton href="/leads/new" label="New Lead" />}
      />

      <div className="p-6 space-y-4">
        {tabs}
        <Card>
          <LeadsTable leads={leads} owners={owners} isHead={isBackOffice(user)} />
        </Card>
      </div>
    </div>
  );
}
