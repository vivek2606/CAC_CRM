import { prisma } from "@/lib/prisma";

// Year-to-date sales vs. target, shared by the Dashboard and Targets page so
// both always show the same numbers.
//
// "department": every Won deal except the Service Manager's (Service is
//   left out of sales tracking - it has no individual target), against the
//   combined targets of the core sales team. Same total as the "Department
//   total" row of the YTD table on /targets.
// "rep": that one person's Won deals against their own targets.
export type YtdScope = { kind: "department" } | { kind: "rep"; userId: string };

export type YtdSummary = {
  // Jan 1 through the end of `throughMonth`, this year and the same window
  // a year earlier.
  start: Date;
  end: Date;
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
  const lyEnd = new Date(Date.UTC(year - 1, lastMonth + 1, 1));
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

  const [targetAgg, actualAgg, lyAgg] = await Promise.all([
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
  ]);

  return {
    start,
    end,
    target: targetAgg._sum.targetValue ?? 0,
    actual: actualAgg._sum.value ?? 0,
    lastYearActual: lyAgg._sum.value ?? 0,
  };
}

export function achievementPct(actual: number, target: number): number | null {
  return target > 0 ? Math.round((actual / target) * 100) : null;
}

export function growthPct(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
}
