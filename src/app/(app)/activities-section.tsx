import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPES } from "@/lib/constants";
import { addActivity } from "./shared-actions";
import { ActivityRow, type ActivityRowData } from "./activity-row";

export function ActivitiesSection({
  activities,
  target,
  path,
}: {
  activities: ActivityRowData[];
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
          type="datetime-local"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          name="description"
          placeholder="Notes (optional)"
          className="flex-1 min-w-[160px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          {activities.map((a) => (
            <ActivityRow key={a.id} activity={a} path={path} />
          ))}
        </ul>
      )}
    </div>
  );
}
