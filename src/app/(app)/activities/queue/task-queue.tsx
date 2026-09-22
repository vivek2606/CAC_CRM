"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, SkipForward, Clock3 } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants";
import { formatTime, hasTimeComponent, relativeDueLabel } from "@/lib/format";
import { ActivityTypeIcon } from "../../activity-type-icon";
import { toggleActivityStatus, updateActivity } from "../../shared-actions";
import type { ActivityType } from "@prisma/client";

export type QueueActivity = {
  id: string;
  type: ActivityType;
  subject: string;
  description: string | null;
  dueAt: Date | null;
  lead: { id: string; title: string } | null;
  deal: { id: string; title: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  account: { id: string; name: string } | null;
};

function relatedFor(a: QueueActivity) {
  if (a.deal) return { href: `/deals/${a.deal.id}`, label: a.deal.title };
  if (a.lead) return { href: `/leads/${a.lead.id}`, label: a.lead.title };
  if (a.contact) return { href: `/contacts/${a.contact.id}`, label: `${a.contact.firstName} ${a.contact.lastName}` };
  if (a.account) return { href: `/accounts/${a.account.id}`, label: a.account.name };
  return null;
}

export function TaskQueue({ activities }: { activities: QueueActivity[] }) {
  const total = activities.length;
  const [queue, setQueue] = useState(activities);
  const [isPending, startTransition] = useTransition();
  const current = queue[0];

  function handleComplete() {
    if (!current) return;
    startTransition(async () => {
      await toggleActivityStatus(current.id, "/activities/queue");
      setQueue((q) => q.slice(1));
    });
  }

  // Pushes the current task to the back of this session's queue rather than
  // dropping it, so "I can't do this one right now" doesn't lose it until
  // the next full page load - a rep can work the rest and circle back.
  function handleSkip() {
    setQueue((q) => (q.length > 1 ? [...q.slice(1), q[0]] : q));
  }

  function handleSnooze(days: number) {
    if (!current) return;
    const newDue = new Date();
    newDue.setHours(9, 0, 0, 0);
    newDue.setDate(newDue.getDate() + days);
    startTransition(async () => {
      await updateActivity(current.id, "/activities/queue", {
        type: current.type,
        subject: current.subject,
        description: current.description ?? "",
        dueAt: newDue.toISOString().slice(0, 16),
      });
      setQueue((q) => q.slice(1));
    });
  }

  if (!current) {
    return (
      <Card className="p-10">
        <EmptyState
          title={total === 0 ? "Nothing pending" : "All caught up!"}
          description={
            total === 0
              ? "You have no pending activities right now."
              : `You worked through all ${total} task${total === 1 ? "" : "s"} in your queue.`
          }
        />
      </Card>
    );
  }

  const related = relatedFor(current);
  const dueLabel = current.dueAt
    ? hasTimeComponent(current.dueAt)
      ? `${relativeDueLabel(current.dueAt)} · ${formatTime(current.dueAt)}`
      : relativeDueLabel(current.dueAt)
    : "No due date";

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <p className="text-sm text-slate-500 text-center">
        {queue.length} of {total} remaining
      </p>
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <ActivityTypeIcon type={current.type} />
          {ACTIVITY_TYPE_LABELS[current.type]}
          <span className="ml-auto normal-case text-amber-600 font-medium">{dueLabel}</span>
        </div>
        <h2 className="text-lg font-semibold text-slate-900">{current.subject}</h2>
        {current.description && <p className="text-sm text-slate-600 whitespace-pre-wrap">{current.description}</p>}
        {related && (
          <Link href={related.href} className="inline-block text-sm text-indigo-600 hover:text-indigo-700">
            {related.label} →
          </Link>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={handleComplete}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
            Complete &amp; Next
          </button>
          <button
            type="button"
            onClick={() => handleSnooze(1)}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
          >
            <Clock3 className="h-4 w-4" />
            Snooze to tomorrow
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={isPending || queue.length <= 1}
            className="inline-flex items-center gap-1.5 ml-auto text-slate-500 hover:text-slate-700 disabled:opacity-60 text-sm font-medium px-3 py-2 transition-colors"
          >
            <SkipForward className="h-4 w-4" />
            Skip for now
          </button>
        </div>
      </Card>
    </div>
  );
}
