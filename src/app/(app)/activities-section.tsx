import { Badge } from "@/components/ui";
import { formatDateTime, relativeDueLabel } from "@/lib/format";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPES } from "@/lib/constants";
import { addActivity, toggleActivityStatus } from "./shared-actions";
import type { ActivityType } from "@prisma/client";

type ActivityItem = {
  id: string;
  type: ActivityType;
  subject: string;
  dueAt: Date | null;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
};

export function ActivitiesSection({
  activities,
  target,
  path,
}: {
  activities: ActivityItem[];
  target: { leadId?: string; dealId?: string; contactId?: string; ownerId?: string };
  path: string;
}) {
  const addAction = addActivity.bind(null, target);

  return (
    <div>
      <form action={addAction} className="flex flex-wrap gap-2 mb-4">
        <select
          name="type"
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          defaultValue="CALL"
        >
          {ACTIVITY_TYPES.filter((t) => t !== "NOTE").map((t) => (
            <option key={t} value={t}>
              {ACTIVITY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input
          name="subject"
          placeholder="What needs to happen?"
          required
          className="flex-1 min-w-[160px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          name="dueAt"
          type="date"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          Log
        </button>
      </form>

      {activities.length === 0 ? (
        <p className="text-sm text-slate-400">No activities logged yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {activities.map((a) => {
            const toggle = toggleActivityStatus.bind(null, a.id, path);
            return (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <form action={toggle}>
                  <button
                    type="submit"
                    className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${
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
                <span
                  className={`text-sm flex-1 ${
                    a.status === "COMPLETED" ? "text-slate-400 line-through" : "text-slate-700"
                  }`}
                >
                  {a.subject}
                </span>
                <span className="text-xs text-slate-400">
                  {a.status === "COMPLETED" ? formatDateTime(a.dueAt) : relativeDueLabel(a.dueAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
