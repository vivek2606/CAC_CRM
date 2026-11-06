import type { Prisma } from "@prisma/client";

// A stalled deal: open, and no real contact with the customer for
// STALE_DAYS - judged by activities (calls, emails, meetings, visits, quote
// sends - all logged as activities), not by the deal's last edit, so a small
// change to the deal doesn't reset the clock. A follow-up already planned
// (a pending activity due from today) means someone is on it. New deals get
// STALE_DAYS before they can stall.
export const STALE_DAYS = 14;
const DAY = 86400000;

export function stalledWhere(now = new Date()): Prisma.DealWhereInput {
  const since = new Date(now.getTime() - STALE_DAYS * DAY);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    stage: { notIn: ["WON", "LOST"] },
    isBalance: false,
    createdAt: { lt: since },
    activities: { none: { OR: [{ createdAt: { gte: since } }, { completedAt: { gte: since } }, { status: "PENDING", dueAt: { gte: today } }] } },
  };
}

// The last contact: the latest activity created or completed (else when the
// deal was created).
export function lastContact(d: { createdAt: Date; activities: { createdAt: Date; completedAt: Date | null }[] }): Date {
  let last = d.createdAt;
  for (const a of d.activities) for (const t of [a.createdAt, a.completedAt]) if (t && t > last) last = t;
  return last;
}
export const daysSince = (d: Date, now = new Date()) => Math.floor((now.getTime() - d.getTime()) / DAY);
