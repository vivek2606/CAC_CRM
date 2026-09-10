import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPES } from "@/lib/constants";
import { addActivity } from "../shared-actions";
import { ActivitiesList } from "./activities-list";

export default async function ActivitiesPage() {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);

  const [activities, owners] = await Promise.all([
    prisma.activity.findMany({
      where: { ownerId: { in: ownerIds } },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      include: {
        owner: { select: { name: true, avatarColor: true } },
        lead: { select: { id: true, title: true } },
        deal: { select: { id: true, title: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
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

        <ActivitiesList activities={activities} owners={owners} isHead={user.role === "HEAD"} />
      </div>
    </div>
  );
}
