import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPES } from "@/lib/constants";
import { addActivity } from "../shared-actions";
import { ActivityRow, type ActivityRowData } from "../activity-row";
import type { ActivityStatus, ActivityType } from "@prisma/client";

type FullActivity = ActivityRowData & {
  owner: { name: string; avatarColor: string };
  lead: { id: string; title: string } | null;
  deal: { id: string; title: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
};

// Buckets for the pending view, so "what do I need to do" reads as a plan
// rather than one long date-sorted list. Boundaries are calendar-day based
// (not exact-time) - a specific overdue-by-hours item still gets its red
// styling from ActivityRow within whichever bucket it lands in.
const BUCKET_ORDER = ["Overdue", "Today", "This Week", "Later", "No Due Date"] as const;
type Bucket = (typeof BUCKET_ORDER)[number];

function bucketFor(dueAt: Date | null): Bucket {
  if (!dueAt) return "No Due Date";
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  if (dueAt < todayStart) return "Overdue";
  if (dueAt < tomorrowStart) return "Today";
  if (dueAt < weekEnd) return "This Week";
  return "Later";
}

function relatedFor(a: FullActivity) {
  if (a.deal) return { href: `/deals/${a.deal.id}`, label: a.deal.title };
  if (a.lead) return { href: `/leads/${a.lead.id}`, label: a.lead.title };
  if (a.contact) return { href: `/contacts/${a.contact.id}`, label: `${a.contact.firstName} ${a.contact.lastName}` };
  return null;
}

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; owner?: string }>;
}) {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);
  const params = await searchParams;

  const statusFilter = params.status ?? "PENDING";

  const where: {
    ownerId: { in: string[] };
    status?: ActivityStatus;
    type?: ActivityType;
  } = {
    ownerId: { in: params.owner ? [params.owner] : ownerIds },
  };
  if (statusFilter !== "ALL") where.status = statusFilter as ActivityStatus;
  if (params.type) where.type = params.type as ActivityType;

  const [activities, owners] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      include: {
        owner: { select: { name: true, avatarColor: true } },
        lead: { select: { id: true, title: true } },
        deal: { select: { id: true, title: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
      take: 100,
    }),
    user.role === "HEAD"
      ? prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const addStandaloneActivity = addActivity.bind(null, { ownerId: user.id });

  // Bucket the list only for the primary "Pending" view - Completed/All stay
  // a flat, most-relevant-first list (bucketing a mix of done + not-done
  // items by due date doesn't read as a plan the same way).
  const grouped: Partial<Record<Bucket, FullActivity[]>> = {};
  if (statusFilter === "PENDING") {
    for (const a of activities) {
      const bucket = bucketFor(a.dueAt);
      (grouped[bucket] ??= []).push(a);
    }
  }

  return (
    <div>
      <PageHeader title="Activities" description="Calls, meetings, emails and tasks across your sales cycle" />

      <div className="p-6 space-y-4">
        <Card className="p-4">
          <form action={addStandaloneActivity} className="flex flex-wrap gap-2">
            <select
              name="type"
              defaultValue="TASK"
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {ACTIVITY_TYPES.filter((t) => t !== "NOTE").map((t) => (
                <option key={t} value={t}>
                  {ACTIVITY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <input
              name="subject"
              placeholder="Quick add a task for yourself..."
              required
              className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              name="dueAt"
              type="datetime-local"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 transition-colors"
            >
              Add
            </button>
          </form>
        </Card>

        <form className="flex flex-wrap gap-3 items-center" action="/activities">
          <select
            name="status"
            defaultValue={params.status ?? "PENDING"}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="PENDING">Pending</option>
            <option value="COMPLETED">Completed</option>
            <option value="ALL">All</option>
          </select>
          <select
            name="type"
            defaultValue={params.type ?? ""}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All types</option>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {user.role === "HEAD" && (
            <select
              name="owner"
              defaultValue={params.owner ?? ""}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All sales managers</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="submit"
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 transition-colors"
          >
            Filter
          </button>
        </form>

        {activities.length === 0 ? (
          <Card>
            <EmptyState title="Nothing here" description="No activities match your filters." />
          </Card>
        ) : statusFilter === "PENDING" ? (
          <div className="space-y-4">
            {BUCKET_ORDER.filter((b) => grouped[b]?.length).map((bucket) => (
              <Card key={bucket}>
                <div className="px-4 pt-3 pb-1">
                  <h2
                    className={`text-xs font-semibold uppercase tracking-wide ${
                      bucket === "Overdue" ? "text-rose-600" : bucket === "Today" ? "text-amber-600" : "text-slate-400"
                    }`}
                  >
                    {bucket} ({grouped[bucket]!.length})
                  </h2>
                </div>
                <ul className="divide-y divide-slate-100 px-4">
                  {grouped[bucket]!.map((a) => (
                    <ActivityRow
                      key={a.id}
                      activity={a}
                      path="/activities"
                      owner={user.role === "HEAD" ? a.owner : undefined}
                      related={relatedFor(a)}
                    />
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <ul className="divide-y divide-slate-100 px-4">
              {activities.map((a) => (
                <ActivityRow
                  key={a.id}
                  activity={a}
                  path="/activities"
                  owner={user.role === "HEAD" ? a.owner : undefined}
                  related={relatedFor(a)}
                />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
