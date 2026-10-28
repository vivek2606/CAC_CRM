import Link from "next/link";
import { getMonthlyPipeline } from "@/lib/monthly-pipeline";
import { PipelineThisMonth } from "@/components/monthly-pipeline-table";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds, isBackOffice } from "@/lib/rbac";
import { PageHeader, Card, Badge, StatCard, EmptyState } from "@/components/ui";
import { formatCompactCurrency, formatCurrency, formatDate, relativeDueLabel } from "@/lib/format";
import { OPEN_DEAL_STAGES, ACTIVITY_TYPE_LABELS, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, LEAD_STATUS_CHART_COLORS, DEAL_STAGE_LABELS } from "@/lib/constants";
import type { LeadStatus } from "@prisma/client";
import { PipelineChart } from "./pipeline-chart";
import { PipelineWaterfallChart, type WaterfallStep } from "./pipeline-waterfall-chart";
import { ShareStackedBar, type ShareBarRow } from "@/components/share-stacked-bar";
import { ActivityTypeIcon } from "./activity-type-icon";
import { TargetTrendChart, type TargetTrendRow } from "./targets/target-trend-chart";
import { Target, TrendingUp, Wallet, ArrowRight, UserPlus, XCircle } from "lucide-react";
import { getYtdSummary, achievementPct } from "@/lib/ytd";
import { getProjectBillings } from "@/lib/project-billing";
import { getLeadStats } from "@/lib/lead-stats";
import { getMonthSales } from "@/lib/month-sales";
import { getQuoteFollowUps, followUpItems, FOLLOW_UP_RED_DAYS } from "@/lib/quote-followups";
import { FollowUpList } from "./quotations/follow-ups/follow-up-list";

const TREND_MONTHS = 6;
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const shortMonth = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

// The dashboard: this month at a glance, target vs sales over the last six
// months, new leads by sales person, and what's coming up. Detailed
// reports live in their own tabs (Incentives & Targets, Sales Register,
// Team Reports).
export default async function DashboardPage() {
  const user = await requireUser();
  const team = isBackOffice(user);
  const ownerIds = await visibleOwnerIds(user);

  const now = new Date();
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const months = Array.from({ length: TREND_MONTHS }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (TREND_MONTHS - 1 - i), 1)));
  const trendStart = months[0];
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Targets and sales: the sales team (Head / Coordinator) or yourself.
  const reps = team
    ? await prisma.user.findMany({ where: { isActive: true, title: "Sales Manager" }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [{ id: user.id, name: user.name ?? "Me" }];
  const repIds = reps.map((r) => r.id);

  // A sales person's quotations due a follow-up (the Head / Coordinator get
  // the team's in their notifications and the Follow-ups tab).
  const followUps = team ? [] : await getQuoteFollowUps([user.id]);
  const followUpRed = followUps.filter((q) => q.level === "red").length;

  const [targets, wonDeals, projects, openDeals, ytd, leadStats, upcoming, overdueCount, myLeads, leadStatusGroups, pipeStart, pipeNew, pipeLost, pipeWon] = await Promise.all([
    prisma.target.findMany({ where: { userId: { in: repIds }, month: { in: months } }, select: { month: true, targetValue: true } }),
    prisma.deal.findMany({
      where: { ownerId: { in: repIds }, stage: "WON", closedAt: { gte: trendStart, lt: nextMonth } },
      select: { value: true, closedAt: true },
    }),
    getProjectBillings({ in: repIds }, trendStart, nextMonth),
    prisma.deal.findMany({ where: { ownerId: { in: ownerIds }, stage: { in: OPEN_DEAL_STAGES } }, select: { value: true, probability: true, stage: true } }),
    getYtdSummary(team ? { kind: "department" } : { kind: "rep", userId: user.id }, thisMonth),
    getLeadStats(ownerIds, now),
    prisma.activity.findMany({
      where: { ownerId: team ? { in: ownerIds } : user.id, status: "PENDING" },
      orderBy: { dueAt: "asc" },
      take: 6,
      include: {
        deal: { select: { title: true } },
        lead: { select: { title: true } },
        contact: { select: { firstName: true, lastName: true } },
        account: { select: { name: true } },
      },
    }),
    prisma.activity.count({ where: { ownerId: team ? { in: ownerIds } : user.id, status: "PENDING", dueAt: { lt: startOfToday } } }),
    team
      ? Promise.resolve([])
      : prisma.lead.findMany({
          where: { ownerId: user.id, createdAt: { gte: prevMonth } },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, title: true, company: true, value: true, status: true, createdAt: true },
        }),
    prisma.lead.groupBy({ by: ["status"], where: { ownerId: { in: ownerIds } }, _count: true }),
    // Pipeline movement this month: a deal created before the month was in
    // the starting pipeline if it's still open, or was closed this month.
    prisma.deal.aggregate({
      where: { ownerId: { in: ownerIds }, createdAt: { lt: thisMonth }, OR: [{ stage: { in: OPEN_DEAL_STAGES } }, { closedAt: { gte: thisMonth, lt: nextMonth } }] },
      _sum: { value: true },
    }),
    prisma.deal.aggregate({ where: { ownerId: { in: ownerIds }, createdAt: { gte: thisMonth, lt: nextMonth } }, _sum: { value: true } }),
    prisma.deal.aggregate({ where: { ownerId: { in: ownerIds }, stage: "LOST", closedAt: { gte: thisMonth, lt: nextMonth } }, _sum: { value: true } }),
    prisma.deal.aggregate({ where: { ownerId: { in: ownerIds }, stage: "WON", closedAt: { gte: thisMonth, lt: nextMonth } }, _sum: { value: true } }),
  ]);

  // Target vs sales by month (sales = won deals + project billing, as on Targets).
  const targetBy = new Map<string, number>();
  for (const t of targets) targetBy.set(monthKey(t.month), (targetBy.get(monthKey(t.month)) ?? 0) + t.targetValue);
  const salesBy = new Map<string, number>();
  for (const d of wonDeals) if (d.closedAt) salesBy.set(monthKey(d.closedAt), (salesBy.get(monthKey(d.closedAt)) ?? 0) + d.value);
  for (const p of projects) salesBy.set(monthKey(p.docDate), (salesBy.get(monthKey(p.docDate)) ?? 0) + p.value);
  const trend: (TargetTrendRow & { key: string })[] = months.map((m) => ({
    key: monthKey(m),
    month: shortMonth(m),
    target: targetBy.get(monthKey(m)) ?? 0,
    actual: salesBy.get(monthKey(m)) ?? 0,
  }));
  const current = trend[trend.length - 1];
  const monthPct = achievementPct(current.actual, current.target);
  const ytdPct = achievementPct(ytd.actual, ytd.target);
  const openValue = openDeals.reduce((t, d) => t + d.value, 0);
  const weighted = openDeals.reduce((t, d) => t + (d.value * (d.probability ?? 0)) / 100, 0);
  const leadTrend = leadStats.newLastMonth > 0 ? Math.round(((leadStats.newThisMonth - leadStats.newLastMonth) / leadStats.newLastMonth) * 100) : null;
  const pctText = (p: number | null) => (p == null ? "—" : `${p}%`);
  const stageData = OPEN_DEAL_STAGES.map((stage) => {
    const ds = openDeals.filter((d) => d.stage === stage);
    return { stage: DEAL_STAGE_LABELS[stage], value: ds.reduce((t, d) => t + d.value, 0), count: ds.length };
  });
  const [ps, pn, pl, pw] = [pipeStart, pipeNew, pipeLost, pipeWon].map((a) => a._sum.value ?? 0);
  const waterfall: WaterfallStep[] = [
    { name: "Start", delta: 0, display: ps, kind: "total" },
    { name: "New", delta: pn, display: pn, kind: "new" },
    { name: "Lost", delta: -pl, display: -pl, kind: "lost" },
    { name: "Won", delta: -pw, display: -pw, kind: "won" },
    { name: "Now", delta: 0, display: ps + pn - pl - pw, kind: "total" },
  ];
  const leadCount = new Map(leadStatusGroups.map((g) => [g.status, g._count]));
  const leadMix: ShareBarRow[] = (["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "UNQUALIFIED"] as LeadStatus[])
    .map((st) => ({ label: LEAD_STATUS_LABELS[st], count: leadCount.get(st) ?? 0, value: 0, fill: LEAD_STATUS_CHART_COLORS[st] }))
    .filter((row) => row.count > 0);
  const monthSales = await getMonthSales(ownerIds, thisMonth, nextMonth, repIds);
  // Open / converted / won, this month, per sales person.
  const pipelineMonth = await getMonthlyPipeline(reps, [thisMonth], now);
  const monthLast = new Date(nextMonth.getTime() - 86400000).toISOString().slice(0, 10);
  const registerLink = (extra: Record<string, string>) =>
    `/reports/sales-register?${new URLSearchParams({ from: thisMonth.toISOString().slice(0, 10), to: monthLast, ...extra })}`;
  const catTotal = monthSales.categories.reduce((t, c) => t + c.value, 0);
  const monthName = thisMonth.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const trendTarget = trend.reduce((s, r) => s + r.target, 0);
  const trendSales = trend.reduce((s, r) => s + r.actual, 0);

  return (
    <div>
      <PageHeader
        title={team ? "Team Dashboard" : "My Dashboard"}
        description={now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
      />

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            label="Sales This Month"
            value={formatCompactCurrency(current.actual)}
            sub={current.target > 0 ? `${pctText(monthPct)} of ${formatCompactCurrency(current.target)} target` : "No target set this month"}
            icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
            accent="emerald"
          />
          <StatCard
            label="Year to Date"
            value={pctText(ytdPct)}
            sub={ytd.target > 0 ? `${formatCompactCurrency(ytd.actual)} of ${formatCompactCurrency(ytd.target)} target` : `${formatCompactCurrency(ytd.actual)} sales`}
            icon={<Target className="h-4 w-4 text-amber-500" />}
            accent="amber"
          />
          <StatCard
            label="Open Pipeline"
            value={formatCompactCurrency(openValue)}
            sub={`${openDeals.length} deal${openDeals.length === 1 ? "" : "s"} · ${formatCompactCurrency(weighted)} weighted`}
            icon={<Wallet className="h-4 w-4 text-indigo-500" />}
            accent="indigo"
          />
          <StatCard
            label="New Leads This Month"
            value={String(leadStats.newThisMonth)}
            sub={
              <>
                {leadStats.newLastMonth} last month
                {leadTrend != null && (
                  <span className={leadTrend >= 0 ? "text-emerald-600" : "text-rose-600"}>
                    {" "}
                    · {leadTrend >= 0 ? "+" : ""}
                    {leadTrend}%
                  </span>
                )}
              </>
            }
            icon={<UserPlus className="h-4 w-4 text-sky-500" />}
            accent="sky"
          />
          <StatCard
            label="Lost This Month"
            value={String(leadStats.lostThisMonth)}
            sub={
              <>
                {formatCompactCurrency(leadStats.lostThisMonthValue)} ·{" "}
                <Link href={`/deals/closed?stage=LOST&month=${monthKey(thisMonth)}`} className="text-indigo-600 hover:text-indigo-700">
                  view
                </Link>
              </>
            }
            icon={<XCircle className="h-4 w-4 text-rose-500" />}
            accent="rose"
          />
        </div>

        {followUps.length > 0 && (
          <Card className="p-5">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Quotations to follow up</h2>
                <Badge bg="bg-amber-100" text="text-amber-800">
                  {followUps.length}
                </Badge>
                {followUpRed > 0 && (
                  <Badge bg="bg-rose-100" text="text-rose-700">
                    {followUpRed} over {FOLLOW_UP_RED_DAYS} days
                  </Badge>
                )}
              </div>
              <Link href="/quotations/follow-ups" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <FollowUpList items={followUpItems(followUps.slice(0, 5))} />
          </Card>
        )}

        <Card className="p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-900">Target vs sales, last {TREND_MONTHS} months</h2>
            <Link href="/targets" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Targets <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <p className="text-xs text-slate-400 mb-3">{team ? "Sales team" : "Your sales"} - won deals plus project billing, excl. VAT. The current month is still running.</p>
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 items-center">
            <div className="xl:col-span-3">
              <TargetTrendChart data={trend} />
            </div>
            <div className="xl:col-span-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="font-medium">Month</th>
                    <th className="font-medium text-right">Target</th>
                    <th className="font-medium text-right">Sales</th>
                    <th className="font-medium text-right">Achieved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trend.map((r) => {
                    const p = achievementPct(r.actual, r.target);
                    return (
                      <tr key={r.key} className="text-slate-700">
                        <td>{r.month}</td>
                        <td className="text-right tabular-nums">{formatCurrency(r.target)}</td>
                        <td className="text-right tabular-nums">{formatCurrency(r.actual)}</td>
                        <td className={`text-right tabular-nums font-medium ${p == null ? "text-slate-400" : p >= 100 ? "text-emerald-700" : p >= 80 ? "text-amber-700" : "text-rose-700"}`}>
                          {pctText(p)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                    <td>Total</td>
                    <td className="text-right tabular-nums">{formatCurrency(trendTarget)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(trendSales)}</td>
                    <td className="text-right tabular-nums">{pctText(achievementPct(trendSales, trendTarget))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-900">
              {team ? "Deals by sales person" : "My deals"}, {monthName}
            </h2>
            {team && (
              <Link href="/reports#pipeline-months" className="text-xs text-indigo-600 hover:text-indigo-700">
                Last 6 months →
              </Link>
            )}
          </div>
          <p className="mb-2 text-xs text-slate-400">Open deals now, deals converted from a lead this month, and deals won this month (by invoice date).</p>
          <div className="overflow-x-auto">
            <PipelineThisMonth data={pipelineMonth} />
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {team && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-slate-900">Sales by sales person, {monthName}</h2>
                <Link href={registerLink({})} className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                  Sales Register <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="font-medium">Sales person</th>
                      <th className="font-medium text-right">Target</th>
                      <th className="font-medium text-right">Product sales</th>
                      <th className="font-medium text-right">Project billing</th>
                      <th className="font-medium text-right">Total</th>
                      <th className="font-medium text-right">Achieved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthSales.people.map((r) => {
                      const p = achievementPct(r.sales, r.target);
                      return (
                        <tr key={r.userId} className="text-slate-700">
                          <td>
                            <Link href={registerLink({ rep: r.userId })} className="font-medium text-indigo-700 hover:underline">
                              {r.name}
                            </Link>
                          </td>
                          <td className="text-right tabular-nums">{formatCurrency(r.target)}</td>
                          <td className="text-right tabular-nums">{formatCurrency(r.productSales)}</td>
                          <td className="text-right tabular-nums">{formatCurrency(r.projectSales)}</td>
                          <td className="text-right tabular-nums font-semibold text-slate-900">{formatCurrency(r.sales)}</td>
                          <td className={`text-right tabular-nums font-medium ${p == null ? "text-slate-400" : p >= 100 ? "text-emerald-700" : p >= 80 ? "text-amber-700" : "text-rose-700"}`}>
                            {pctText(p)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const t = monthSales.people.reduce(
                        (a, r) => ({ target: a.target + r.target, product: a.product + r.productSales, project: a.project + r.projectSales, sales: a.sales + r.sales }),
                        { target: 0, product: 0, project: 0, sales: 0 },
                      );
                      return (
                        <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                          <td>Total</td>
                          <td className="text-right tabular-nums">{formatCurrency(t.target)}</td>
                          <td className="text-right tabular-nums">{formatCurrency(t.product)}</td>
                          <td className="text-right tabular-nums">{formatCurrency(t.project)}</td>
                          <td className="text-right tabular-nums">{formatCurrency(t.sales)}</td>
                          <td className="text-right tabular-nums">{pctText(achievementPct(t.sales, t.target))}</td>
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
          <Card className={`p-5 ${team ? "" : "lg:col-span-2"}`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-900">Sales by product category, {monthName}</h2>
              <Link href={registerLink({})} className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                Sales Register <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {monthSales.categories.length === 0 ? (
              <EmptyState title="No sales yet this month" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="font-medium">Product category</th>
                      <th className="font-medium text-right">Qty</th>
                      <th className="font-medium text-right">Sales value</th>
                      <th className="font-medium text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthSales.categories.map((c) => (
                      <tr key={c.category} className="text-slate-700">
                        <td>
                          <Link href={registerLink({ category: c.category })} className="font-medium text-indigo-700 hover:underline">
                            {c.category}
                          </Link>
                        </td>
                        <td className="text-right tabular-nums">{c.qty ? c.qty.toLocaleString("en-NG", { maximumFractionDigits: 2 }) : "—"}</td>
                        <td className="text-right tabular-nums">{formatCurrency(c.value)}</td>
                        <td className="text-right tabular-nums">{catTotal ? `${((c.value / catTotal) * 100).toFixed(1)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                      <td>Total</td>
                      <td className="text-right tabular-nums">{monthSales.categories.reduce((t, c) => t + c.qty, 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}</td>
                      <td className="text-right tabular-nums">{formatCurrency(catTotal)}</td>
                      <td className="text-right tabular-nums">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-slate-900">Open pipeline by stage</h2>
              <Link href="/deals" className="text-xs text-indigo-600 hover:text-indigo-700">
                Pipeline
              </Link>
            </div>
            {openDeals.length > 0 ? <PipelineChart data={stageData} height={170} /> : <EmptyState title="No open deals" />}
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Pipeline movement, this month</h2>
            <PipelineWaterfallChart steps={waterfall} height={170} />
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Lead pipeline mix</h2>
            {leadMix.length === 0 ? (
              <EmptyState title="No leads yet" />
            ) : (
              <>
                <ShareStackedBar data={leadMix} unitLabel="lead" showValue={false} />
                <p className="mt-2 text-xs text-slate-400">{leadMix.reduce((t, r) => t + r.count, 0)} leads in total</p>
              </>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2 p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-900">{team ? "New leads by sales person" : "My new leads"}</h2>
              <Link href="/leads" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                All leads <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {team ? (
              leadStats.byPerson.length === 0 ? (
                <EmptyState title="No sales people found" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="font-medium">Sales person</th>
                        <th className="font-medium text-right">This month</th>
                        <th className="font-medium text-right">Last month</th>
                        <th className="font-medium text-right">Active leads</th>
                        <th className="font-medium text-right">Active lead value</th>
                        <th className="font-medium text-right">Conversion, 90 days</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leadStats.byPerson.map((r) => (
                        <tr key={r.userId} className="text-slate-700">
                          <td>
                            <Link href={`/deals?owner=${r.userId}`} className="font-medium text-indigo-700 hover:underline">
                              {r.name}
                            </Link>
                          </td>
                          <td className="text-right tabular-nums font-semibold text-slate-900">{r.newThisMonth}</td>
                          <td className="text-right tabular-nums text-slate-500">{r.newLastMonth}</td>
                          <td className="text-right tabular-nums">{r.active}</td>
                          <td className="text-right tabular-nums">{formatCurrency(r.activeValue)}</td>
                          <td className="text-right tabular-nums">
                            {r.created90 ? `${Math.round((r.converted90 / r.created90) * 100)}% (${r.converted90} of ${r.created90})` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                        <td>Team</td>
                        <td className="text-right tabular-nums">{leadStats.newThisMonth}</td>
                        <td className="text-right tabular-nums">{leadStats.newLastMonth}</td>
                        <td className="text-right tabular-nums">{leadStats.activeCount}</td>
                        <td className="text-right tabular-nums">{formatCurrency(leadStats.activeValue)}</td>
                        <td className="text-right tabular-nums">
                          {leadStats.conversionPct == null ? "—" : `${leadStats.conversionPct}% (${leadStats.converted90} of ${leadStats.created90})`}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            ) : myLeads.length === 0 ? (
              <EmptyState title="No new leads since last month" description="Leads you add show here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="font-medium">Lead</th>
                      <th className="font-medium">Company</th>
                      <th className="font-medium">Status</th>
                      <th className="font-medium text-right">Est. value</th>
                      <th className="font-medium text-right">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {myLeads.map((l) => (
                      <tr key={l.id} className="text-slate-700">
                        <td>
                          <Link href={`/leads/${l.id}`} className="font-medium text-indigo-700 hover:underline">
                            {l.title}
                          </Link>
                        </td>
                        <td>{l.company ?? "—"}</td>
                        <td>
                          <Badge bg={LEAD_STATUS_COLORS[l.status].bg} text={LEAD_STATUS_COLORS[l.status].text}>
                            {LEAD_STATUS_LABELS[l.status]}
                          </Badge>
                        </td>
                        <td className="text-right tabular-nums">{l.value != null ? formatCurrency(l.value) : "—"}</td>
                        <td className="text-right whitespace-nowrap">{formatDate(l.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Upcoming activities</h2>
                {overdueCount > 0 && (
                  <Badge bg="bg-rose-100" text="text-rose-700">
                    {overdueCount} overdue
                  </Badge>
                )}
              </div>
              <Link href="/leads?tab=activities" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <EmptyState title="Nothing scheduled" description="You're all caught up." />
            ) : (
              <ul className="space-y-2.5">
                {upcoming.map((a) => {
                  const overdue = a.dueAt != null && a.dueAt < startOfToday;
                  return (
                    <li key={a.id} className="flex items-start gap-2.5">
                      <span className="mt-0.5 text-slate-400">
                        <ActivityTypeIcon type={a.type} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800 truncate">{a.subject}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {ACTIVITY_TYPE_LABELS[a.type]} ·{" "}
                          {a.deal?.title ?? a.lead?.title ?? (a.contact ? `${a.contact.firstName} ${a.contact.lastName}` : null) ?? a.account?.name ?? "—"} ·{" "}
                          <span className={overdue ? "text-rose-600 font-medium" : ""}>{relativeDueLabel(a.dueAt)}</span>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
