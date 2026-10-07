import { prisma } from "@/lib/prisma";
import {
  calculateSalesIncentive,
  distributeSupportPool,
  getIncentiveSettings,
  type IncentiveSettings,
  type SalesIncentive,
  type SupportShare,
} from "@/lib/incentive";

// One month's incentive for the whole team - shared by the Incentives page,
// the approval step and the approved PDF so they always agree. The whole
// team is always calculated (the support pool depends on everyone's
// figures); who may see which rows is up to the caller.
export async function computeMonthIncentives(month: Date): Promise<{
  settings: IncentiveSettings;
  rows: SalesIncentive[];
  support: SupportShare[];
}> {
  const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const [settings, reps] = await Promise.all([
    getIncentiveSettings(),
    prisma.user.findMany({ where: { isActive: true, title: "Sales Manager" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const repIds = reps.map((r) => r.id);
  const [targets, sales, projects] = await Promise.all([
    prisma.target.findMany({ where: { userId: { in: repIds }, month }, select: { userId: true, targetValue: true } }),
    prisma.deal.groupBy({
      by: ["ownerId"],
      where: { ownerId: { in: repIds }, stage: "WON", closedAt: { gte: month, lt: nextMonth } },
      _sum: { value: true },
    }),
    // Project & Service billing counts toward incentive too.
    prisma.projectBilling.groupBy({
      by: ["ownerId"],
      where: { ownerId: { in: repIds }, month },
      _sum: { value: true },
    }),
  ]);
  const projectBy = new Map(projects.map((p) => [p.ownerId, p._sum.value ?? 0]));
  const targetBy = new Map(targets.map((t) => [t.userId, t.targetValue]));
  const salesBy = new Map(sales.map((s) => [s.ownerId, s._sum.value ?? 0]));
  const rows = reps.map((r) =>
    calculateSalesIncentive(
      {
        userId: r.id,
        name: r.name,
        target: targetBy.get(r.id) ?? 0,
        productSales: salesBy.get(r.id) ?? 0,
        projectSales: projectBy.get(r.id) ?? 0,
      },
      settings,
    ),
  );
  const pool = rows.reduce((s, r) => s + r.toPool, 0);
  return { settings, rows, support: distributeSupportPool(pool, settings) };
}
