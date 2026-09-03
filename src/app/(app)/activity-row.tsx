"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { Badge, Avatar } from "@/components/ui";
import { formatDateTime, relativeDueLabel, formatTime, hasTimeComponent } from "@/lib/format";
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants";
import { ActivityTypeIcon } from "./activity-type-icon";
import { EditActivityDialog } from "./edit-activity-dialog";
import { toggleActivityStatus, updateActivity, deleteActivity } from "./shared-actions";
import type { ActivityStatus, ActivityType } from "@prisma/client";

export type ActivityRowData = {
  id: string;
  type: ActivityType;
  subject: string;
  description: string | null;
  dueAt: Date | null;
  status: ActivityStatus;
  completedAt: Date | null;
};

export function ActivityRow({
  activity,
  path,
  owner,
  related,
}: {
  activity: ActivityRowData;
  path: string;
  owner?: { name: string; avatarColor: string };
  related?: { href: string; label: string } | null;
}) {
  const [editing, setEditing] = useState(false);
  const isOverdue = activity.status === "PENDING" && activity.dueAt != null && new Date(activity.dueAt) < new Date();
  const isToday = activity.status === "PENDING" && relativeDueLabel(activity.dueAt) === "Today";

  const dueLabel =
    activity.status === "COMPLETED"
      ? formatDateTime(activity.completedAt)
      : activity.dueAt && hasTimeComponent(activity.dueAt)
        ? `${relativeDueLabel(activity.dueAt)} · ${formatTime(activity.dueAt)}`
        : relativeDueLabel(activity.dueAt);

  return (
    <li className="flex items-start gap-3 py-2.5">
      <form action={toggleActivityStatus.bind(null, activity.id, path)} className="mt-0.5">
        <button
          type="submit"
          className={`h-5 w-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
            activity.status === "COMPLETED"
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "border-slate-300 hover:border-slate-400"
          }`}
          aria-label="Toggle complete"
        >
          {activity.status === "COMPLETED" && "✓"}
        </button>
      </form>

      <Badge>
        <span className="inline-flex items-center gap-1">
          <ActivityTypeIcon type={activity.type} />
          {ACTIVITY_TYPE_LABELS[activity.type]}
        </span>
      </Badge>

      <div className="min-w-0 flex-1">
        <p className={`text-sm ${activity.status === "COMPLETED" ? "text-slate-400 line-through" : "text-slate-800"}`}>
          {activity.subject}
        </p>
        {activity.description && <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{activity.description}</p>}
        {related && (
          <Link href={related.href} className="text-xs text-indigo-600 hover:text-indigo-700">
            {related.label}
          </Link>
        )}
      </div>

      {owner && (
        <div className="hidden sm:flex items-center shrink-0">
          <Avatar name={owner.name} color={owner.avatarColor} size={6} />
        </div>
      )}

      <span
        className={`text-xs shrink-0 w-32 text-right ${
          isOverdue ? "text-rose-600 font-medium" : isToday ? "text-amber-600 font-medium" : "text-slate-400"
        }`}
      >
        {dueLabel}
      </span>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit activity"
          className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm("Delete this activity?")) deleteActivity(activity.id, path);
          }}
          aria-label="Delete activity"
          className="text-slate-400 hover:text-red-600 transition-colors p-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing && (
        <EditActivityDialog
          activity={activity}
          onCancel={() => setEditing(false)}
          onConfirm={(data) => {
            updateActivity(activity.id, path, data);
            setEditing(false);
          }}
        />
      )}
    </li>
  );
}
