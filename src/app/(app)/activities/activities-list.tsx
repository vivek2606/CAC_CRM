"use client";

import { useMemo, useState } from "react";
import { Card, EmptyState } from "@/components/ui";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPES } from "@/lib/constants";
import { ActivityRow, type ActivityRowData } from "../activity-row";

export type FullActivity = ActivityRowData & {
  ownerId: string;
  owner: { name: string; avatarColor: string };
  lead: { id: string; title: string } | null;
  deal: { id: string; title: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
};

type Owner = { id: string; name: string };

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

// Filters entirely client-side as you pick a status/type/owner, no submit
// button - the server loads every visible activity up front (this app's
// activity volume is bounded by manual logging, not bulk import, so there's
// no scale concern in fetching it all at once).
export function ActivitiesList({
  activities,
  owners,
  isHead,
}: {
  activities: FullActivity[];
  owners: Owner[];
  isHead: boolean;
}) {
  const [status, setStatus] = useState<"PENDING" | "COMPLETED" | "ALL">("PENDING");
  const [type, setType] = useState("");
  const [ownerId, setOwnerId] = useState("");

  const filtered = useMemo(() => {
    return activities.filter(
      (a) =>
        (status === "ALL" || a.status === status) &&
        (type === "" || a.type === type) &&
        (ownerId === "" || a.ownerId === ownerId)
    );
  }, [activities, status, type, ownerId]);

  const grouped: Partial<Record<Bucket, FullActivity[]>> = {};
  if (status === "PENDING") {
    for (const a of filtered) {
      const bucket = bucketFor(a.dueAt);
      (grouped[bucket] ??= []).push(a);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "PENDING" | "COMPLETED" | "ALL")}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
          <option value="ALL">All</option>
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All types</option>
          {ACTIVITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACTIVITY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        {isHead && (
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
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
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState title="Nothing here" description="No activities match your filters." />
        </Card>
      ) : status === "PENDING" ? (
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
                    owner={isHead ? a.owner : undefined}
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
            {filtered.map((a) => (
              <ActivityRow
                key={a.id}
                activity={a}
                path="/activities"
                owner={isHead ? a.owner : undefined}
                related={relatedFor(a)}
              />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
