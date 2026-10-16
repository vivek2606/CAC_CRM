import { prisma } from "@/lib/prisma";
import { getProjectBillings } from "@/lib/project-billing";
import type { DealStage, LostReason } from "@prisma/client";

// Everything on Team Reports, for the current sales team over one period
// (whole months). Revenue counts every won deal (Sales Register imports
// too); pipeline measures (win rate, cycle, stages, forecast) only deals run
// through the CRM - the register has no lost deals or stage history.

const DAY = 86400000;
const OPEN: DealStage[] = ["QUALIFICATION", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION"];
const STALE_DAYS = 14;
const CONTACT = new Set(["CALL", "EMAIL", "MEETING"]);

export type RepScore = {
  id: string;
  name: string;
  target: number;
  achieved: number; // won + project billing in the period
  wonCount: number;
  wonValue: number;
  winRate: number | null;
  avgDeal: number | null;
  openCount: number;
  openValue: number;
  weighted: number;
  overdue: number; // open, past expected close
  stale: number; // open, no activity for STALE_DAYS
  newLeads: number;
  // Deals converted from a lead in the period (whenever the lead came in) -
  // the same count as the monthly trend.
  converted: number;
  // Of the leads created in the period, the share converted so far.
  convRate: number | null;
  cycleDays: number | null;
  responseHrs: number | null;
  calls: number;
  meetings: number;
  connectRate: number | null;
  newAccounts: number;
};

export type TeamReport = {
  from: Date;
  to: Date; // first of the last month
  months: number;
  reps: RepScore[];
  team: RepScore;
  prevWonValue: number;
  thisMonthTarget: number;
  stages: { stage: DealStage; count: number; value: number; weighted: number; avgAgeDays: number | null; overdue: number }[];
  forecast: { label: string; count: number; value: number; weighted: number; commit: number }[];
  lostReasons: { reason: LostReason | "UNSPECIFIED"; count: number; value: number }[];
  lostTo: { brand: string; count: number }[];
  competitors: { label: string; won: number; lost: number; winRate: number }[];
  sources: { source: string; leads: number; converted: number; convRate: number; wonValue: number }[];
  segments: { segment: string; open: number; openValue: number; won: number; wonValue: number; winRate: number | null }[];
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export async function getTeamReport(from: Date, to: Date, now = new Date()): Promise<TeamReport> {
  const start = from;
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 1));
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1;
  const prevStart = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - months, 1));
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const staleBefore = new Date(now.getTime() - STALE_DAYS * DAY);

  const people = await prisma.user.findMany({ where: { isActive: true, title: "Sales Manager" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const ids = people.map((p) => p.id);

  const [deals, leads, activities, targets, projects, accounts, thisMonthTargets] = await Promise.all([
    prisma.deal.findMany({
      where: {
        ownerId: { in: ids },
        OR: [{ stage: { in: OPEN } }, { closedAt: { gte: prevStart, lt: end } }, { createdAt: { gte: start, lt: end } }],
      },
      select: {
        id: true,
        ownerId: true,
        stage: true,
        value: true,
        probability: true,
        createdAt: true,
        closedAt: true,
        expectedCloseDate: true,
        stageChangedAt: true,
        sourceTxnNo: true,
        lostReasonCategory: true,
        lostToBrand: true,
        competitorBrand: true,
        endUseSegment: true,
        activities: { select: { type: true, createdAt: true }, orderBy: { createdAt: "asc" } },
        sourceLead: { select: { id: true } },
      },
    }),
    prisma.lead.findMany({
      where: { ownerId: { in: ids }, createdAt: { gte: start, lt: end } },
      select: { ownerId: true, source: true, convertedDeal: { select: { stage: true, value: true } } },
    }),
    prisma.activity.findMany({
      where: { ownerId: { in: ids }, createdAt: { gte: start, lt: end } },
      select: { ownerId: true, type: true, callOutcome: true },
    }),
    prisma.target.findMany({ where: { userId: { in: ids }, month: { gte: start, lt: end } }, select: { userId: true, targetValue: true } }),
    getProjectBillings({ in: ids }, start, end),
    prisma.account.findMany({ where: { ownerId: { in: ids } }, select: { ownerId: true, deals: { where: { stage: "WON" }, select: { closedAt: true } } } }),
    prisma.target.findMany({ where: { userId: { in: ids }, month: thisMonth }, select: { targetValue: true } }),
  ]);

  const inRange = (d: Date | null) => d != null && d >= start && d < end;
  const crm = deals.filter((d) => d.sourceTxnNo == null);
  const open = crm.filter((d) => OPEN.includes(d.stage));
  const wonIn = deals.filter((d) => d.stage === "WON" && inRange(d.closedAt));
  const closedCrmIn = crm.filter((d) => (d.stage === "WON" || d.stage === "LOST") && inRange(d.closedAt));
  const lastActivity = (d: (typeof deals)[number]) => d.activities.at(-1)?.createdAt ?? null;

  const score = (owner: (x: { ownerId: string }) => boolean, id: string, name: string): RepScore => {
    const o = open.filter(owner);
    const won = wonIn.filter(owner);
    const closed = closedCrmIn.filter(owner);
    const l = leads.filter(owner);
    const acts = activities.filter(owner);
    const calls = acts.filter((a) => a.type === "CALL");
    const withOutcome = calls.filter((a) => a.callOutcome != null);
    const responses = crm
      .filter(owner)
      .filter((d) => inRange(d.createdAt))
      .map((d) => {
        const first = d.activities.find((a) => CONTACT.has(a.type));
        return first ? (first.createdAt.getTime() - d.createdAt.getTime()) / 3600000 : null;
      })
      .filter((x): x is number => x != null && x >= 0);
    const cycles = won.filter((d) => d.sourceTxnNo == null && d.closedAt).map((d) => (d.closedAt!.getTime() - d.createdAt.getTime()) / DAY).filter((x) => x >= 0);
    const wonValue = won.reduce((s, d) => s + d.value, 0);
    const positive = won.filter((d) => d.value > 0);
    const projectValue = projects.filter(owner).reduce((s, p) => s + p.value, 0);
    const wonCrm = closed.filter((d) => d.stage === "WON").length;
    const converted = deals.filter(owner).filter((d) => d.sourceLead && inRange(d.createdAt)).length;
    const newLeadsConverted = l.filter((x) => x.convertedDeal).length;
    const newAccounts = accounts.filter(owner).filter((a) => {
      const first = a.deals.map((x) => x.closedAt?.getTime() ?? Infinity).reduce((m, t) => Math.min(m, t), Infinity);
      return first !== Infinity && first >= start.getTime() && first < end.getTime();
    }).length;
    return {
      id,
      name,
      target: targets.filter((t) => owner({ ownerId: t.userId })).reduce((s, t) => s + t.targetValue, 0),
      achieved: wonValue + projectValue,
      wonCount: positive.length,
      wonValue,
      winRate: pct(wonCrm, closed.length),
      avgDeal: positive.length ? positive.reduce((s, d) => s + d.value, 0) / positive.length : null,
      openCount: o.length,
      openValue: o.reduce((s, d) => s + d.value, 0),
      weighted: o.reduce((s, d) => s + (d.value * d.probability) / 100, 0),
      overdue: o.filter((d) => d.expectedCloseDate && d.expectedCloseDate < today).length,
      stale: o.filter((d) => (lastActivity(d) ?? d.createdAt) < staleBefore).length,
      newLeads: l.length,
      converted,
      convRate: pct(newLeadsConverted, l.length),
      cycleDays: avg(cycles),
      responseHrs: avg(responses),
      calls: calls.length,
      meetings: acts.filter((a) => a.type === "MEETING").length,
      connectRate: pct(withOutcome.filter((a) => a.callOutcome === "CONNECTED").length, withOutcome.length),
      newAccounts,
    };
  };

  const reps = people.map((p) => score((x) => x.ownerId === p.id, p.id, p.name));
  const team = score(() => true, "team", "Team");

  // Pipeline by stage (open CRM deals now).
  const stages = OPEN.map((stage) => {
    const ds = open.filter((d) => d.stage === stage);
    return {
      stage,
      count: ds.length,
      value: ds.reduce((s, d) => s + d.value, 0),
      weighted: ds.reduce((s, d) => s + (d.value * d.probability) / 100, 0),
      avgAgeDays: avg(ds.map((d) => (now.getTime() - (d.stageChangedAt ?? d.createdAt).getTime()) / DAY)),
      overdue: ds.filter((d) => d.expectedCloseDate && d.expectedCloseDate < today).length,
    };
  });

  // Forecast by expected close month: overdue, this month, the next two, later, no date.
  const bucket = (label: string, ds: typeof open) => ({
    label,
    count: ds.length,
    value: ds.reduce((s, d) => s + d.value, 0),
    weighted: ds.reduce((s, d) => s + (d.value * d.probability) / 100, 0),
    commit: ds.filter((d) => d.probability >= 70).reduce((s, d) => s + d.value, 0),
  });
  const monthStart = (k: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1));
  const label = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const forecast = [
    bucket("Overdue (past expected close)", open.filter((d) => d.expectedCloseDate && d.expectedCloseDate < today)),
    ...[0, 1, 2].map((k) => bucket(label(monthStart(k)), open.filter((d) => d.expectedCloseDate && d.expectedCloseDate >= (k === 0 ? today : monthStart(k)) && d.expectedCloseDate < monthStart(k + 1)))),
    bucket("Later", open.filter((d) => d.expectedCloseDate && d.expectedCloseDate >= monthStart(3))),
    bucket("No expected close date", open.filter((d) => !d.expectedCloseDate)),
  ];

  // Win / loss (CRM deals closed in the period).
  const lostIn = closedCrmIn.filter((d) => d.stage === "LOST");
  const reasonMap = new Map<string, { count: number; value: number }>();
  for (const d of lostIn) {
    const k = d.lostReasonCategory ?? "UNSPECIFIED";
    const g = reasonMap.get(k) ?? { count: 0, value: 0 };
    g.count++;
    g.value += d.value;
    reasonMap.set(k, g);
  }
  const lostReasons = [...reasonMap.entries()].map(([reason, g]) => ({ reason: reason as LostReason | "UNSPECIFIED", ...g })).sort((a, b) => b.count - a.count);
  const brandMap = new Map<string, { brand: string; count: number }>();
  for (const d of lostIn) {
    const b = d.lostToBrand?.trim();
    if (!b) continue;
    const g = brandMap.get(b.toLowerCase()) ?? { brand: b, count: 0 };
    g.count++;
    brandMap.set(b.toLowerCase(), g);
  }
  const lostTo = [...brandMap.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  const compMap = new Map<string, { label: string; won: number; lost: number }>();
  for (const d of closedCrmIn) {
    const b = d.competitorBrand?.trim();
    if (!b) continue;
    const g = compMap.get(b.toLowerCase()) ?? { label: b, won: 0, lost: 0 };
    if (d.stage === "WON") g.won++;
    else g.lost++;
    compMap.set(b.toLowerCase(), g);
  }
  const competitors = [...compMap.values()].map((g) => ({ ...g, winRate: Math.round((g.won / (g.won + g.lost)) * 100) })).sort((a, b) => b.won + b.lost - (a.won + a.lost));

  // Where business comes from.
  const srcMap = new Map<string, { leads: number; converted: number; wonValue: number }>();
  for (const l of leads) {
    const g = srcMap.get(l.source) ?? { leads: 0, converted: 0, wonValue: 0 };
    g.leads++;
    if (l.convertedDeal) {
      g.converted++;
      if (l.convertedDeal.stage === "WON") g.wonValue += l.convertedDeal.value;
    }
    srcMap.set(l.source, g);
  }
  const sources = [...srcMap.entries()].map(([source, g]) => ({ source, ...g, convRate: Math.round((g.converted / g.leads) * 100) })).sort((a, b) => b.leads - a.leads);
  const segMap = new Map<string, { open: number; openValue: number; won: number; wonValue: number; closed: number }>();
  const seg = (k: string) => segMap.get(k) ?? { open: 0, openValue: 0, won: 0, wonValue: 0, closed: 0 };
  for (const d of open) if (d.endUseSegment) segMap.set(d.endUseSegment, { ...seg(d.endUseSegment), open: seg(d.endUseSegment).open + 1, openValue: seg(d.endUseSegment).openValue + d.value });
  for (const d of closedCrmIn) {
    if (!d.endUseSegment) continue;
    const g = seg(d.endUseSegment);
    g.closed++;
    if (d.stage === "WON") {
      g.won++;
      g.wonValue += d.value;
    }
    segMap.set(d.endUseSegment, g);
  }
  const segments = [...segMap.entries()].map(([segment, g]) => ({ segment, open: g.open, openValue: g.openValue, won: g.won, wonValue: g.wonValue, winRate: pct(g.won, g.closed) })).sort((a, b) => b.openValue + b.wonValue - (a.openValue + a.wonValue));

  return {
    from,
    to,
    months,
    reps,
    team,
    prevWonValue: deals.filter((d) => d.stage === "WON" && d.closedAt && d.closedAt >= prevStart && d.closedAt < start).reduce((s, d) => s + d.value, 0),
    thisMonthTarget: thisMonthTargets.reduce((s, t) => s + t.targetValue, 0),
    stages,
    forecast,
    lostReasons,
    lostTo,
    competitors,
    sources,
    segments,
  };
}
