import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card, StatCard, Avatar } from "@/components/ui";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import {
  OPEN_DEAL_STAGES,
  CLOSED_LEAD_STATUSES,
  DEAL_STAGES,
  DEAL_STAGE_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCE_COLORS,
  LOST_REASONS,
  LOST_REASON_LABELS,
  LOST_REASON_COLORS,
} from "@/lib/constants";
import { RepComparisonChart } from "./rep-chart";
import { StageValueChart, type StageValueRow } from "./stage-value-chart";
import { ProbabilityExposureChart } from "./probability-exposure-chart";
import { ConversionFunnel } from "./conversion-funnel";
import { LeadSourceChart } from "./lead-source-chart";
import { LostReasonChart } from "./lost-reason-chart";
import { ExportCsvButton } from "@/components/export-csv-button";
import { Wallet, TrendingUp, Percent, Users } from "lucide-react";

function startOfQuarter(date: Date): Date {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth, 1);
}

// Only these are counted as "the CAC sales team" for individual rows -
// everyone else (historical staff, other divisions, service) rolls up
// into a single "Others" row instead of cluttering the report.
const CAC_SALES_TITLE = "Sales Manager";

export default async function ReportsPage() {
  await requireHead();

  const qStart = startOfQuarter(new Date());

  const allReps = await prisma.user.findMany({
    where: { role: "SALES_MANAGER" },
    orderBy: { name: "asc" },
    include: {
      deals: {
        select: { stage: true, value: true, probability: true, closedAt: true, createdAt: true, lostReasonCategory: true },
      },
      leads: {
        select: { status: true, source: true, winProbability: true, value: true, convertedDeal: { select: { stage: true } } },
      },
      activities: { select: { status: true } },
    },
  });

  const salesReps = allReps.filter((r) => r.isActive && r.title === CAC_SALES_TITLE);
  const others = allReps.filter((r) => !(r.isActive && r.title === CAC_SALES_TITLE));

  function computeStats(id: string, name: string, avatarColor: string, group: typeof allReps) {
    const deals = group.flatMap((r) => r.deals);
    const leads = group.flatMap((r) => r.leads);
    const activities = group.flatMap((r) => r.activities);

    const openDeals = deals.filter((d) => OPEN_DEAL_STAGES.includes(d.stage));
    const wonDeals = deals.filter((d) => d.stage === "WON");
    const lostDeals = deals.filter((d) => d.stage === "LOST");
    const wonThisQuarter = wonDeals.filter((d) => d.closedAt && d.closedAt >= qStart);
    const closedCount = wonDeals.length + lostDeals.length;
    const winRate = closedCount > 0 ? Math.round((wonDeals.length / closedCount) * 100) : 0;
    const activeLeads = leads.filter((l) => !CLOSED_LEAD_STATUSES.includes(l.status)).length;
    const pendingActivities = activities.filter((a) => a.status === "PENDING").length;
    const completedActivities = activities.filter((a) => a.status === "COMPLETED").length;

    return {
      id,
      name,
      avatarColor,
      openValue: openDeals.reduce((s, d) => s + d.value, 0),
      openCount: openDeals.length,
      wonQuarterValue: wonThisQuarter.reduce((s, d) => s + d.value, 0),
      wonQuarterCount: wonThisQuarter.length,
      winRate,
      activeLeads,
      pendingActivities,
      completedActivities,
    };
  }

  const repStats = salesReps.map((rep) => computeStats(rep.id, rep.name, rep.avatarColor, [rep]));
  const othersStats =
    others.length > 0 ? computeStats("others", "Others", "#94a3b8", others) : null;

  // Headline team stats reflect only the current 6-person CAC sales team,
  // not the historical/other-division data folded into "Others".
  const teamOpenValue = repStats.reduce((s, r) => s + r.openValue, 0);
  const teamWonQuarter = repStats.reduce((s, r) => s + r.wonQuarterValue, 0);
  const teamAvgWinRate =
    repStats.length > 0 ? Math.round(repStats.reduce((s, r) => s + r.winRate, 0) / repStats.length) : 0;

  const tableRows = othersStats ? [...repStats, othersStats] : repStats;
  const chartData = tableRows
    .map((r) => ({ name: r.name.split(" ")[0], open: r.openValue, won: r.wonQuarterValue }))
    .sort((a, b) => b.won - a.won);

  // The 4 analytics sections below are scoped to the 6 active CAC reps only,
  // same as the headline stats above - mixing in "Others" would swamp them
  // with 1800+ historical bulk-imported deals from before this system existed.
  const teamDeals = salesReps.flatMap((r) => r.deals);
  const teamLeads = salesReps.flatMap((r) => r.leads);

  // 1. Deal value by stage, per rep (stacked bar).
  const stageValueData: StageValueRow[] = salesReps.map((rep) => {
    const row = { name: rep.name.split(" ")[0] } as StageValueRow;
    for (const stage of DEAL_STAGES) row[stage] = 0;
    for (const deal of rep.deals) row[deal.stage] += deal.value;
    return row;
  });

  // 2. Pipeline/leads exposure by win probability (open deals + open leads,
  // bucketed to the nearest 10% so both fields line up on one scale).
  function roundToBucket(pct: number): number {
    return Math.min(100, Math.max(10, Math.round(pct / 10) * 10));
  }
  const openTeamDeals = teamDeals.filter((d) => OPEN_DEAL_STAGES.includes(d.stage));
  const openTeamLeads = teamLeads.filter((l) => !CLOSED_LEAD_STATUSES.includes(l.status));
  const probabilityExposureData = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((bucket) => ({
    bucket: `${bucket}%`,
    pipeline: openTeamDeals.filter((d) => roundToBucket(d.probability) === bucket).reduce((s, d) => s + d.value, 0),
    leads: openTeamLeads
      .filter((l) => l.winProbability != null && l.winProbability === bucket)
      .reduce((s, l) => s + (l.value ?? 0), 0),
  }));

  // 3. Conversion funnel: every lead -> qualified -> converted to a deal -> won.
  const totalLeadsCount = teamLeads.length;
  const qualifiedLeadsCount = teamLeads.filter((l) => l.status === "QUALIFIED" || l.status === "CONVERTED").length;
  const convertedLeadsCount = teamLeads.filter((l) => l.status === "CONVERTED").length;
  const wonFromLeadsCount = teamLeads.filter((l) => l.convertedDeal?.stage === "WON").length;
  const leadFunnelStages = [
    { label: "Total Leads", value: totalLeadsCount },
    { label: "Qualified", value: qualifiedLeadsCount },
    { label: "Converted to Deal", value: convertedLeadsCount },
    { label: "Won", value: wonFromLeadsCount },
  ];

  // 3b. Deal value funnel: value of deals that have reached each stage or
  // later (cumulative, so it narrows monotonically like a real funnel -
  // a deal sitting in Negotiation has necessarily passed every stage before it).
  const DEAL_FUNNEL_STAGE_ORDER: (typeof DEAL_STAGES)[number][] = [
    "QUALIFICATION",
    "NEEDS_ANALYSIS",
    "PROPOSAL",
    "NEGOTIATION",
    "WON",
  ];
  const dealValueFunnelStages = DEAL_FUNNEL_STAGE_ORDER.map((stage, idx) => {
    const laterStages = new Set(DEAL_FUNNEL_STAGE_ORDER.slice(idx));
    const value = teamDeals.filter((d) => laterStages.has(d.stage)).reduce((s, d) => s + d.value, 0);
    return { label: DEAL_STAGE_LABELS[stage], value };
  });

  // 4. Lead source distribution.
  const sourceGroups = new Map<string, { count: number; value: number }>();
  for (const lead of teamLeads) {
    const g = sourceGroups.get(lead.source) ?? { count: 0, value: 0 };
    g.count += 1;
    g.value += lead.value ?? 0;
    sourceGroups.set(lead.source, g);
  }
  const leadSourceData = LEAD_SOURCES.map((source) => ({
    source: LEAD_SOURCE_LABELS[source],
    count: sourceGroups.get(source)?.count ?? 0,
    value: sourceGroups.get(source)?.value ?? 0,
    fill: LEAD_SOURCE_COLORS[source],
  }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  // 5. Why we lose: only deals closed as LOST after this feature shipped
  // have a category - older LOST deals predate it and just don't appear.
  const lostDeals = teamDeals.filter((d) => d.stage === "LOST" && d.lostReasonCategory);
  const lostReasonGroups = new Map<string, { count: number; value: number }>();
  for (const deal of lostDeals) {
    const key = deal.lostReasonCategory!;
    const g = lostReasonGroups.get(key) ?? { count: 0, value: 0 };
    g.count += 1;
    g.value += deal.value;
    lostReasonGroups.set(key, g);
  }
  const lostReasonData = LOST_REASONS.map((reason) => ({
    reason: LOST_REASON_LABELS[reason],
    count: lostReasonGroups.get(reason)?.count ?? 0,
    value: lostReasonGroups.get(reason)?.value ?? 0,
    fill: LOST_REASON_COLORS[reason],
  }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div>
      <PageHeader
        title="Team Reports"
        description={`Performance across your ${salesReps.length} CAC sales managers${othersStats ? " (everyone else rolled into Others)" : ""}`}
        action={
          <Link href="/reports/category" className="text-sm text-indigo-600 hover:text-indigo-700">
            Sales by Category →
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Team Open Pipeline"
            value={formatCompactCurrency(teamOpenValue)}
            icon={<Wallet className="h-4 w-4 text-indigo-500" />}
          />
          <StatCard
            label="Won This Quarter"
            value={formatCompactCurrency(teamWonQuarter)}
            icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          />
          <StatCard
            label="Avg. Win Rate"
            value={`${teamAvgWinRate}%`}
            icon={<Percent className="h-4 w-4 text-amber-500" />}
          />
          <StatCard
            label="Team Size"
            value={String(salesReps.length)}
            sub="CAC sales managers"
            icon={<Users className="h-4 w-4 text-sky-500" />}
          />
        </div>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Open pipeline vs. won this quarter</h2>
          <RepComparisonChart data={chartData} />
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Deal value by status, per sales manager</h2>
          <p className="text-xs text-slate-400 mb-3">Every deal each rep owns, split out by pipeline stage.</p>
          <StageValueChart data={stageValueData} />
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Exposure by winning probability</h2>
          <p className="text-xs text-slate-400 mb-3">Open deal and lead value, bucketed by confidence of closing.</p>
          <ProbabilityExposureChart data={probabilityExposureData} />
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Lead conversion funnel</h2>
            <p className="text-xs text-slate-400 mb-3">Every lead&apos;s journey from first contact to a won deal.</p>
            <ConversionFunnel stages={leadFunnelStages} />
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Deal value funnel</h2>
            <p className="text-xs text-slate-400 mb-3">Value of deals that have reached each stage or further.</p>
            <ConversionFunnel stages={dealValueFunnelStages} formatValue={formatCompactCurrency} />
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Lead source distribution</h2>
            <p className="text-xs text-slate-400 mb-3">Where the team&apos;s leads are coming from.</p>
            {leadSourceData.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No leads yet.</p>
            ) : (
              <LeadSourceChart data={leadSourceData} />
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Why we lose</h2>
            <p className="text-xs text-slate-400 mb-3">Reasons given when a deal is marked Lost.</p>
            {lostReasonData.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No lost deals with a reason yet.</p>
            ) : (
              <LostReasonChart data={lostReasonData} />
            )}
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-end p-4 pb-0">
            <ExportCsvButton
              filename="team-reports-summary.csv"
              headers={[
                "Sales Manager",
                "Open Pipeline",
                "Open Deals",
                "Won (Qtr)",
                "Won Count (Qtr)",
                "Win Rate %",
                "Active Leads",
                "Tasks Pending",
                "Tasks Done",
              ]}
              rows={tableRows.map((r) => [
                r.name,
                r.openValue,
                r.openCount,
                r.wonQuarterValue,
                r.wonQuarterCount,
                r.winRate,
                r.activeLeads,
                r.pendingActivities,
                r.completedActivities,
              ])}
            />
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Sales Manager</th>
                <th className="px-4 py-3 font-medium">Open Pipeline</th>
                <th className="px-4 py-3 font-medium">Won (Qtr)</th>
                <th className="px-4 py-3 font-medium">Win Rate</th>
                <th className="px-4 py-3 font-medium">Active Leads</th>
                <th className="px-4 py-3 font-medium">Tasks Pending</th>
                <th className="px-4 py-3 font-medium">Tasks Done</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableRows.map((r) => (
                <tr
                  key={r.id}
                  className={`hover:bg-slate-50 transition-colors ${r.id === "others" ? "bg-slate-50/60" : ""}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={r.name} color={r.avatarColor} size={7} />
                      <span className={r.id === "others" ? "font-medium text-slate-500 italic" : "font-medium text-slate-800"}>
                        {r.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatCurrency(r.openValue)} <span className="text-slate-400">({r.openCount})</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatCurrency(r.wonQuarterValue)} <span className="text-slate-400">({r.wonQuarterCount})</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.winRate}%</td>
                  <td className="px-4 py-3 text-slate-700">{r.activeLeads}</td>
                  <td className="px-4 py-3 text-slate-700">{r.pendingActivities}</td>
                  <td className="px-4 py-3 text-slate-700">{r.completedActivities}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
