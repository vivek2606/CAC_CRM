import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card, StatCard, Avatar } from "@/components/ui";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { OPEN_DEAL_STAGES } from "@/lib/constants";
import { RepComparisonChart } from "./rep-chart";
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
      deals: { select: { stage: true, value: true, closedAt: true, createdAt: true } },
      leads: { select: { status: true } },
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
    const activeLeads = leads.filter((l) => l.status !== "CONVERTED" && l.status !== "UNQUALIFIED").length;
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

  return (
    <div>
      <PageHeader
        title="Team Reports"
        description={`Performance across your ${salesReps.length} CAC sales managers${othersStats ? " (everyone else rolled into Others)" : ""}`}
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

        <Card>
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
        </Card>
      </div>
    </div>
  );
}
