"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPES, CALL_OUTCOMES, CALL_OUTCOME_LABELS } from "@/lib/constants";
import { addNote, addActivity } from "./shared-actions";
import { ActivityRow, type ActivityRowData } from "./activity-row";
import type { ActivityType } from "@prisma/client";

type NoteItem = {
  id: string;
  body: string;
  createdAt: Date;
  author: { name: string; avatarColor: string };
};

type TimelineActivity = ActivityRowData & { createdAt: Date };

type TimelineEntry =
  | { kind: "note"; date: Date; note: NoteItem }
  | { kind: "activity"; date: Date; activity: TimelineActivity };

const LOG_MODES = [
  { value: "note", label: "Add a note" },
  { value: "activity", label: "Log an activity" },
] as const;
type LogMode = (typeof LOG_MODES)[number]["value"];

// A single merged, chronological feed of everything logged on this record -
// HubSpot's record timeline - replacing separate Notes and Activities
// sections so there's one place to see "what's happened here" instead of
// two lists to check. Sorted by when each item was actually logged
// (createdAt), not a pending task's future due date - "what's due" is
// already the Activities tab's and Dashboard's job, not this one's.
export function RecordTimeline({
  notes,
  activities,
  target,
  path,
}: {
  notes: NoteItem[];
  activities: TimelineActivity[];
  target: { leadId?: string; dealId?: string; contactId?: string; ownerId?: string };
  path: string;
}) {
  const [mode, setMode] = useState<LogMode>("note");
  const [activityType, setActivityType] = useState<ActivityType>("CALL");
  const addNoteAction = addNote.bind(null, target);
  const addActivityAction = addActivity.bind(null, target);

  const entries: TimelineEntry[] = [
    ...notes.map((note) => ({ kind: "note" as const, date: note.createdAt, note })),
    ...activities.map((activity) => ({ kind: "activity" as const, date: activity.createdAt, activity })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {LOG_MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === m.value
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "note" ? (
        <form action={addNoteAction} className="flex gap-2 mb-4">
          <input
            name="body"
            placeholder="Add a note..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            Add
          </button>
        </form>
      ) : (
        <form action={addActivityAction} className="flex flex-wrap gap-2 mb-4">
          <select
            name="type"
            value={activityType}
            onChange={(e) => setActivityType(e.target.value as ActivityType)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {ACTIVITY_TYPES.filter((t) => t !== "NOTE").map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {activityType === "CALL" && (
            <select
              name="callOutcome"
              defaultValue=""
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Outcome (optional)</option>
              {CALL_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {CALL_OUTCOME_LABELS[o]}
                </option>
              ))}
            </select>
          )}
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
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing logged yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {entries.map((entry) =>
            entry.kind === "note" ? (
              <li key={`note-${entry.note.id}`} className="flex gap-3 py-3">
                <Avatar name={entry.note.author.name} color={entry.note.author.avatarColor} size={7} />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-slate-800">{entry.note.author.name}</span>
                    <span className="text-xs text-slate-400">{formatDateTime(entry.note.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{entry.note.body}</p>
                </div>
              </li>
            ) : (
              <ActivityRow key={`activity-${entry.activity.id}`} activity={entry.activity} path={path} />
            )
          )}
        </ul>
      )}
    </div>
  );
}
