import { prisma } from "@/lib/prisma";

// Year-to-date sales vs. target, shared by the Dashboard and Targets page so
// both always show the same numbers.
//
// Sales = Won deals + Project & Service billing.
// "department": every Won deal except the Service Manager's (Service is
//   left out of sales tracking - it has no individual target), against the
//   combined targets of the core sales team. Same total as the "Department
//   total" row of the YTD table on /targets.
// "rep": that one person's Won deals against their own targets.
export type YtdScope = { kind: "department" } | { kind: "rep"; userId: string };

export type YtdSummary = {
  // Jan 1 through the end of `throughMonth` (or through today, while
  // `throughMonth` is the current month), and the matching window a year
  // earlier - lastYearEnd is exclusive.
  start: Date;
  end: Date;
  lastYearStart: Date;
  lastYearEnd: Date;
  target: number;
  actual: number;
  lastYearActual: number;
};

export async function getYtdSummary(scope: YtdScope, throughMonth: Date): Promise<YtdSummary> {
  const year = throughMonth.getUTCFullYear();
  const lastMonth = throughMonth.getUTCMonth();
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, lastMonth + 1, 1));
  const lyStart = new Date(Date.UTC(year - 1, 0, 1));
  // While the month is still running, compare like for like: this year has
  // only reached today, so last year stops at the same date rather than
  // taking in the whole of that month.
  const now = new Date();
  const isCurrentMonth = year === now.getUTCFullYear() && lastMonth === now.getUTCMonth();
  const lyEnd = isCurrentMonth
    ? new Date(Date.UTC(year - 1, lastMonth, now.getUTCDate() + 1))
    : new Date(Date.UTC(year - 1, lastMonth + 1, 1));
  const months = Array.from({ length: lastMonth + 1 }, (_, i) => new Date(Date.UTC(year, i, 1)));

  let ownerFilter: { in: string[] } | { notIn: string[] } | string;
  let targetUserIds: string[];
  if (scope.kind === "rep") {
    ownerFilter = scope.userId;
    targetUserIds = [scope.userId];
  } else {
    const [serviceUsers, coreReps] = await Promise.all([
      prisma.user.findMany({ where: { isActive: true, title: "Service Manager" }, select: { id: true } }),
      prisma.user.findMany({ where: { isActive: true, title: "Sales Manager" }, select: { id: true } }),
    ]);
    ownerFilter = { notIn: serviceUsers.map((u) => u.id) };
    targetUserIds = coreReps.map((u) => u.id);
  }

  const [targetAgg, actualAgg, lyAgg, projectAgg, lyProjectAgg] = await Promise.all([
    prisma.target.aggregate({
      where: { userId: { in: targetUserIds }, month: { in: months } },
      _sum: { targetValue: true },
    }),
    prisma.deal.aggregate({
      where: { ownerId: ownerFilter, stage: "WON", closedAt: { gte: start, lt: end } },
      _sum: { value: true },
    }),
    prisma.deal.aggregate({
      where: { ownerId: ownerFilter, stage: "WON", closedAt: { gte: lyStart, lt: lyEnd } },
      _sum: { value: true },
    }),
    // Project & Service billing counts toward achievement too.
    prisma.projectBilling.aggregate({
      where: { ownerId: ownerFilter, docDate: { gte: start, lt: end } },
      _sum: { value: true },
    }),
    prisma.projectBilling.aggregate({
      where: { ownerId: ownerFilter, docDate: { gte: lyStart, lt: lyEnd } },
      _sum: { value: true },
    }),
  ]);

  return {
    start,
    end,
    lastYearStart: lyStart,
    lastYearEnd: lyEnd,
    target: targetAgg._sum.targetValue ?? 0,
    actual: (actualAgg._sum.value ?? 0) + (projectAgg._sum.value ?? 0),
    lastYearActual: (lyAgg._sum.value ?? 0) + (lyProjectAgg._sum.value ?? 0),
  };
}

export function achievementPct(actual: number, target: number): number | null {
  return target > 0 ? Math.round((actual / target) * 100) : null;
}

export function growthPct(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
}
