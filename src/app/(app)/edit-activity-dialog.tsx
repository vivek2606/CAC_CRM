"use client";

import { useState } from "react";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS } from "@/lib/constants";
import type { ActivityType } from "@prisma/client";

// Formats a Date for a <input type="datetime-local"> value (local time,
// no timezone suffix) - toISOString() would shift to UTC and desync the
// displayed time from what was actually stored.
function toDateTimeLocal(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EditActivityDialog({
  activity,
  onConfirm,
  onCancel,
}: {
  activity: { type: ActivityType; subject: string; description: string | null; dueAt: Date | null };
  onConfirm: (data: { type: ActivityType; subject: string; description: string; dueAt: string }) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<ActivityType>(activity.type);
  const [subject, setSubject] = useState(activity.subject);
  const [description, setDescription] = useState(activity.description ?? "");
  const [dueAt, setDueAt] = useState(toDateTimeLocal(activity.dueAt));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Edit activity</h2>

        <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ActivityType)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {ACTIVITY_TYPES.filter((t) => t !== "NOTE").map((t) => (
            <option key={t} value={t}>
              {ACTIVITY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        <label className="block text-xs font-medium text-slate-500 mb-1">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <label className="block text-xs font-medium text-slate-500 mb-1">Due date &amp; time</label>
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <label className="block text-xs font-medium text-slate-500 mb-1">Notes (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!subject.trim()}
            onClick={() => onConfirm({ type, subject: subject.trim(), description: description.trim(), dueAt })}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white text-sm font-medium px-3.5 py-2 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
