import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, Card, Badge, EmptyState, Avatar } from "@/components/ui";
import { formatDateTime, relativeDueLabel } from "@/lib/format";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPES } from "@/lib/constants";
import { toggleActivityStatus, addActivity } from "../shared-actions";
import type { ActivityStatus, ActivityType } from "@prisma/client";

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
              type="date"
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

        <Card>
          {activities.length === 0 ? (
            <EmptyState title="Nothing here" description="No activities match your filters." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {activities.map((a) => {
                const toggle = toggleActivityStatus.bind(null, a.id, "/activities");
                const relatedHref = a.deal ? `/deals/${a.deal.id}` : a.lead ? `/leads/${a.lead.id}` : a.contact ? `/contacts/${a.contact.id}` : null;
                const relatedLabel = a.deal?.title ?? a.lead?.title ?? (a.contact ? `${a.contact.firstName} ${a.contact.lastName}` : null);
                return (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <form action={toggle}>
                      <button
                        type="submit"
                        className={`h-5 w-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                          a.status === "COMPLETED"
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "border-slate-300 hover:border-slate-400"
                        }`}
                        aria-label="Toggle complete"
                      >
                        {a.status === "COMPLETED" && "✓"}
                      </button>
                    </form>
                    <Badge>{ACTIVITY_TYPE_LABELS[a.type]}</Badge>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm ${
                          a.status === "COMPLETED" ? "text-slate-400 line-through" : "text-slate-800"
                        }`}
                      >
                        {a.subject}
                      </p>
                      {relatedHref && relatedLabel && (
                        <Link href={relatedHref} className="text-xs text-indigo-600 hover:text-indigo-700">
                          {relatedLabel}
                        </Link>
                      )}
                    </div>
                    {user.role === "HEAD" && (
                      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                        <Avatar name={a.owner.name} color={a.owner.avatarColor} size={6} />
                      </div>
                    )}
                    <span className="text-xs text-slate-400 shrink-0 w-28 text-right">
                      {a.status === "COMPLETED" ? formatDateTime(a.completedAt) : relativeDueLabel(a.dueAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
