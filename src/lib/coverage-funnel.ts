import { prisma } from "@/lib/prisma";
import { OPEN_DEAL_STAGES } from "@/lib/constants";
import { NOT_DRAFT } from "@/lib/quote-draft";
import { getProjectBillings } from "@/lib/project-billing";

// Two early-warning measures for the Dashboard.
//
// Pipeline coverage: is there enough in the pipeline to make the target?
//   Window = this month and the next two. Target still to go = the window's
//   targets less this month's sales so far (won deals + project billing, as
//   on the Dashboard). Pipeline = open deals expected to close by the end of
//   the window (no date, or a date already past, counts too - they're still
//   live). Coverage = pipeline / to go; about 3x is healthy, since roughly
//   one deal in three is won.
//
// Funnel: of the leads created in the last 90 days, how many became deals,
//   got a quotation, and were won - and where they drop out.

export const COVERAGE_MONTHS = 3;
export const COVERAGE_GOOD = 3;
export const COVERAGE_LOW = 2;
export const FUNNEL_DAYS = 90;

export type CoverageRow = { userId: string; name: string; target: number; achieved: number; toGo: number; pipeline: number; deals: number; coverage: number | null };
export type FunnelRow = { userId: string; name: string; leads: number; deals: number; quoted: number; won: number; wonValue: number };

export function coverageTone(c: number | null): "good" | "low" | "bad" | "none" {
  if (c == null) return "none";
  return c >= COVERAGE_GOOD ? "good" : c >= COVERAGE_LOW ? "low" : "bad";
}

export async function getCoverage(reps: { id: string; name: string }[], now = new Date()): Promise<{ rows: CoverageRow[]; total: CoverageRow; windowEnd: Date }> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const windowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + COVERAGE_MONTHS, 1));
  const months = Array.from({ length: COVERAGE_MONTHS }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)));
  const ids = reps.map((r) => r.id);
  const [targets, won, projects, open] = await Promise.all([
    prisma.target.findMany({ where: { userId: { in: ids }, month: { in: months } }, select: { userId: true, targetValue: true } }),
    prisma.deal.findMany({ where: { ownerId: { in: ids }, stage: "WON", closedAt: { gte: start, lt: nextMonth } }, select: { ownerId: true, value: true } }),
    getProjectBillings({ in: ids }, start, nextMonth),
    prisma.deal.findMany({
      where: { ownerId: { in: ids }, stage: { in: OPEN_DEAL_STAGES }, OR: [{ expectedCloseDate: null }, { expectedCloseDate: { lt: windowEnd } }] },
      select: { ownerId: true, value: true },
    }),
  ]);
  const sum = <T extends { value: number }>(xs: T[]) => xs.reduce((t, x) => t + x.value, 0);
  const row = (userId: string, name: string, target: number, achieved: number, pipeline: number, deals: number): CoverageRow => {
    const toGo = Math.max(0, target - achieved);
    return { userId, name, target, achieved, toGo, pipeline, deals, coverage: toGo > 0 ? pipeline / toGo : null };
  };
  const rows = reps.map((r) => {
    const mine = open.filter((d) => d.ownerId === r.id);
    return row(
      r.id,
      r.name,
      targets.filter((t) => t.userId === r.id).reduce((s, t) => s + t.targetValue, 0),
      sum(won.filter((d) => d.ownerId === r.id)) + sum(projects.filter((p) => p.ownerId === r.id)),
      sum(mine),
      mine.length,
    );
  });
  const total = row(
    "",
    "Team",
    rows.reduce((s, r) => s + r.target, 0),
    rows.reduce((s, r) => s + r.achieved, 0),
    rows.reduce((s, r) => s + r.pipeline, 0),
    rows.reduce((s, r) => s + r.deals, 0),
  );
  return { rows, total, windowEnd };
}

export async function getFunnel(reps: { id: string; name: string }[], now = new Date()): Promise<{ rows: FunnelRow[]; total: FunnelRow; since: Date }> {
  const since = new Date(now.getTime() - FUNNEL_DAYS * 86400000);
  const leads = await prisma.lead.findMany({
    where: { ownerId: { in: reps.map((r) => r.id) }, createdAt: { gte: since } },
    select: {
      ownerId: true,
      status: true,
      convertedDeal: { select: { stage: true, value: true, _count: { select: { quotations: { where: NOT_DRAFT } } } } },
    },
  });
  const rowFor = (userId: string, name: string, ls: typeof leads): FunnelRow => {
    const deals = ls.filter((l) => l.convertedDeal);
    const won = deals.filter((l) => l.convertedDeal!.stage === "WON");
    return {
      userId,
      name,
      leads: ls.length,
      deals: deals.length,
      // A won deal got its price somewhere - count it as quoted.
      quoted: deals.filter((l) => l.convertedDeal!._count.quotations > 0 || l.convertedDeal!.stage === "WON").length,
      won: won.length,
      wonValue: won.reduce((t, l) => t + l.convertedDeal!.value, 0),
    };
  };
  return {
    rows: reps.map((r) => rowFor(r.id, r.name, leads.filter((l) => l.ownerId === r.id))),
    total: rowFor("", "Team", leads),
    since,
  };
}
