import { prisma } from "@/lib/prisma";
import { getProjectBillings } from "@/lib/project-billing";

// Target vs achievement per sales person for a range of months - achieved
// the same way as on the Targets page: won deals (by invoice date) plus
// project billing, excl. VAT.

export type TACell = { target: number; achieved: number };
export type TARow = { id: string; name: string; months: TACell[]; target: number; achieved: number; pct: number | null };
export type TargetAchievement = { from: Date; to: Date; months: Date[]; rows: TARow[]; team: TARow };

export const achievementPct = (achieved: number, target: number) => (target > 0 ? Math.round((achieved / target) * 1000) / 10 : null);

export function parseMonthParam(raw: string | null | undefined, fallback: Date): Date {
  const m = raw?.match(/^(\d{4})-(\d{1,2})$/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)) : fallback;
}

// From / to from the query (whole months; defaults to the current financial
// year so far - January to this month), at most 24 months.
export function rangeFrom(params: { from?: string | null; to?: string | null }, now = new Date()): { from: Date; to: Date; months: Date[] } {
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  let to = parseMonthParam(params.to, thisMonth);
  let from = parseMonthParam(params.from, new Date(Date.UTC(to.getUTCFullYear(), 0, 1)));
  if (from > to) [from, to] = [to, from];
  const months: Date[] = [];
  for (let d = new Date(from); d <= to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(d);
  const kept = months.slice(-24);
  return { from: kept[0], to, months: kept };
}

export async function getTargetAchievement(from: Date, to: Date, months: Date[]): Promise<TargetAchievement> {
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 1));
  const people = await prisma.user.findMany({ where: { isActive: true, title: "Sales Manager" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const ids = people.map((p) => p.id);
  const [targets, won, projects] = await Promise.all([
    prisma.target.findMany({ where: { userId: { in: ids }, month: { gte: from, lt: end } }, select: { userId: true, month: true, targetValue: true } }),
    prisma.deal.findMany({ where: { ownerId: { in: ids }, stage: "WON", closedAt: { gte: from, lt: end } }, select: { ownerId: true, closedAt: true, value: true } }),
    getProjectBillings({ in: ids }, from, end),
  ]);
  const idx = (d: Date) => months.findIndex((m) => m.getUTCFullYear() === d.getUTCFullYear() && m.getUTCMonth() === d.getUTCMonth());
  const grid = new Map(people.map((p) => [p.id, months.map((): TACell => ({ target: 0, achieved: 0 }))]));
  for (const t of targets) {
    const i = idx(t.month);
    if (i >= 0) grid.get(t.userId)![i].target += t.targetValue;
  }
  for (const d of won) {
    const i = idx(d.closedAt!);
    if (i >= 0) grid.get(d.ownerId)![i].achieved += d.value;
  }
  for (const p of projects) {
    const i = idx(p.docDate);
    if (i >= 0) grid.get(p.ownerId)![i].achieved += p.value;
  }
  const row = (id: string, name: string, cells: TACell[]): TARow => {
    const target = cells.reduce((s, c) => s + c.target, 0);
    const achieved = cells.reduce((s, c) => s + c.achieved, 0);
    return { id, name, months: cells, target, achieved, pct: achievementPct(achieved, target) };
  };
  const rows = people.map((p) => row(p.id, p.name, grid.get(p.id)!));
  const team = row(
    "team",
    "Team",
    months.map((_, i) => ({ target: rows.reduce((s, r) => s + r.months[i].target, 0), achieved: rows.reduce((s, r) => s + r.months[i].achieved, 0) })),
  );
  return { from, to, months, rows, team };
}

export const monthLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
export const periodLabel = (r: { from: Date; to: Date }) => (r.from.getTime() === r.to.getTime() ? monthLabel(r.from) : `${monthLabel(r.from)} - ${monthLabel(r.to)}`);
