import { prisma } from "@/lib/prisma";
import { CLOSED_LEAD_STATUSES } from "@/lib/constants";

const DAY = 86400000;
const CONVERSION_DAYS = 90;

export type LeadStatsRow = { userId: string; name: string; newThisMonth: number; newLastMonth: number; active: number; activeValue: number; created90: number; converted90: number };
export type LeadStats = {
  newThisMonth: number;
  newLastMonth: number;
  activeCount: number;
  activeValue: number;
  created90: number;
  converted90: number;
  conversionPct: number | null;
  avgDaysToDeal: number | null;
  lostThisMonth: number;
  lostThisMonthValue: number;
  byPerson: LeadStatsRow[];
};

// Lead figures for the dashboard: new leads this month vs last, the
// estimated value of active leads (kept apart from the deal pipeline),
// conversion over the last 90 days (leads created in that window that
// became deals) with the average days from lead to deal, and deals lost
// this month.
export async function getLeadStats(ownerIds: string[], now = new Date()): Promise<LeadStats> {
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const since90 = new Date(now.getTime() - CONVERSION_DAYS * DAY);
  const owner = { ownerId: { in: ownerIds } };

  const [recent, active, window90, lost, users] = await Promise.all([
    prisma.lead.findMany({ where: { ...owner, createdAt: { gte: prevMonthStart } }, select: { ownerId: true, createdAt: true } }),
    prisma.lead.findMany({ where: { ...owner, status: { notIn: CLOSED_LEAD_STATUSES } }, select: { ownerId: true, value: true } }),
    prisma.lead.findMany({
      where: { ...owner, createdAt: { gte: since90 } },
      select: { ownerId: true, createdAt: true, status: true, convertedDeal: { select: { createdAt: true } } },
    }),
    prisma.deal.aggregate({ where: { ...owner, stage: "LOST", closedAt: { gte: startOfMonth } }, _count: true, _sum: { value: true } }),
    prisma.user.findMany({ where: { id: { in: ownerIds } }, orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true, title: true } }),
  ]);

  const isConverted = (l: (typeof window90)[number]) => l.status === "CONVERTED" || !!l.convertedDeal;
  const converted = window90.filter(isConverted);
  const days = converted.filter((l) => l.convertedDeal).map((l) => Math.max(0, (l.convertedDeal!.createdAt.getTime() - l.createdAt.getTime()) / DAY));

  // Active sales managers, plus anyone else who has leads in these figures.
  const withLeads = new Set([...recent, ...active, ...window90].map((l) => l.ownerId));
  const people = users.filter((u) => withLeads.has(u.id) || (u.isActive && u.title === "Sales Manager"));
  const byPerson: LeadStatsRow[] = people.map((u) => {
    const mineActive = active.filter((l) => l.ownerId === u.id);
    const mine90 = window90.filter((l) => l.ownerId === u.id);
    return {
      userId: u.id,
      name: u.name,
      newThisMonth: recent.filter((l) => l.ownerId === u.id && l.createdAt >= startOfMonth).length,
      newLastMonth: recent.filter((l) => l.ownerId === u.id && l.createdAt < startOfMonth).length,
      active: mineActive.length,
      activeValue: mineActive.reduce((t, l) => t + (l.value ?? 0), 0),
      created90: mine90.length,
      converted90: mine90.filter(isConverted).length,
    };
  });

  return {
    newThisMonth: recent.filter((l) => l.createdAt >= startOfMonth).length,
    newLastMonth: recent.filter((l) => l.createdAt < startOfMonth).length,
    activeCount: active.length,
    activeValue: active.reduce((t, l) => t + (l.value ?? 0), 0),
    created90: window90.length,
    converted90: converted.length,
    conversionPct: window90.length ? Math.round((converted.length / window90.length) * 100) : null,
    avgDaysToDeal: days.length ? Math.round(days.reduce((t, d) => t + d, 0) / days.length) : null,
    lostThisMonth: lost._count,
    lostThisMonthValue: lost._sum.value ?? 0,
    byPerson,
  };
}
