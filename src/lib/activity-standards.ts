import { prisma } from "@/lib/prisma";

// Activity standards: the weekly minimums each sales person is held to -
// calls, site visits, quotations issued, new leads - set by the Head. A
// week runs Monday to Sunday, Lagos time. Calls and visits count when done
// (completed in the week); quotations when issued (not drafts); leads when
// created.

import { DEFAULT_STANDARDS, STANDARD_KEYS, type Standards } from "@/lib/activity-standards-constants";
export * from "@/lib/activity-standards-constants";
const KEY = "activity-standards";

export async function getStandards(): Promise<Standards> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return { ...DEFAULT_STANDARDS, ...((row?.value as Partial<Standards> | undefined) ?? {}) };
}
export async function saveStandards(s: Standards) {
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: s }, update: { value: s } });
}

const DAY = 86400000;
const LAGOS = 3600000;

// The Lagos Monday (YYYY-MM-DD) of the week containing `d`, and that
// week's bounds as instants.
export function weekOf(d: Date): { monday: string; from: Date; to: Date } {
  const local = new Date(d.getTime() + LAGOS);
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const mon = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY);
  return { monday: mon.toISOString().slice(0, 10), from: new Date(mon.getTime() - LAGOS), to: new Date(mon.getTime() + 7 * DAY - LAGOS) };
}

export type WeekCounts = Standards;
const zero = (): WeekCounts => ({ calls: 0, visits: 0, quotes: 0, leads: 0 });

// Counts for each person, for each of `weeks` weeks ending with the week of
// `now` (oldest first): { mondays, byUser: { id: WeekCounts[] } }.
export async function weeklyCounts(userIds: string[], weeks: number, now = new Date()) {
  const last = weekOf(now);
  const mondays = Array.from({ length: weeks }, (_, i) => new Date(new Date(`${last.monday}T00:00:00Z`).getTime() - (weeks - 1 - i) * 7 * DAY).toISOString().slice(0, 10));
  const from = new Date(new Date(`${mondays[0]}T00:00:00Z`).getTime() - LAGOS);
  const to = last.to;
  const ownerId = { in: userIds };
  const [acts, quotes, leads] = await Promise.all([
    prisma.activity.findMany({ where: { ownerId, status: "COMPLETED", type: { in: ["CALL", "SITE_VISIT"] }, completedAt: { gte: from, lt: to } }, select: { ownerId: true, type: true, completedAt: true } }),
    prisma.quotation.findMany({ where: { ownerId, type: { not: "draft" }, createdAt: { gte: from, lt: to } }, select: { ownerId: true, createdAt: true } }),
    prisma.lead.findMany({ where: { ownerId, createdAt: { gte: from, lt: to } }, select: { ownerId: true, createdAt: true } }),
  ]);
  const byUser: Record<string, WeekCounts[]> = Object.fromEntries(userIds.map((id) => [id, mondays.map(zero)]));
  const idx = (d: Date) => mondays.indexOf(weekOf(d).monday);
  const add = (owner: string | null, d: Date | null, k: keyof Standards) => {
    if (!owner || !d || !byUser[owner]) return;
    const i = idx(d);
    if (i >= 0) byUser[owner][i][k]++;
  };
  for (const a of acts) add(a.ownerId, a.completedAt, a.type === "CALL" ? "calls" : "visits");
  for (const q of quotes) add(q.ownerId, q.createdAt, "quotes");
  for (const l of leads) add(l.ownerId, l.createdAt, "leads");
  return { mondays, byUser };
}

// How many of the four minimums a week's counts meet.
export const metCount = (c: WeekCounts, s: Standards) => STANDARD_KEYS.filter((k) => c[k] >= s[k]).length;
