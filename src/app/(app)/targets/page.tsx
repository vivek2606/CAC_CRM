import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, isBackOffice } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { PerfTabs } from "@/components/perf-tabs";
import { ForecastTable, type ForecastRow } from "./forecast-table";
import { formatCurrency, formatCompactCurrency } from "@/lib/format";
import { TargetChart } from "@/components/target-chart";
import { TargetTrendChart, type TargetTrendRow } from "./target-trend-chart";
import { SetTargetForm } from "./set-target-form";
import { ExportCsvButton } from "@/components/export-csv-button";
import { CategoryChart } from "../reports/category-chart";
import { EQUIPMENT_TYPE_LABELS } from "@/lib/constants";
import { GaugeChart } from "@/components/gauge-chart";
import { getYtdSummary, achievementPct, growthPct } from "@/lib/ytd";
import { getProjectBillings } from "@/lib/project-billing";
import { YtdRepChart, type YtdRepChartRow, type YtdRepSeries } from "./ytd-rep-chart";

const TREND_MONTHS = 12;

function shortMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function parseMonthParam(raw: string | undefined): Date {
  const m = raw?.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function monthValue(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function TargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; rep?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const month = parseMonthParam(params.month);
  const monthStr = monthValue(month);
  const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));

  // allReps: the full active sales team (Head) or just yourself (rep) -
  // always available so "Set a target" can target anyone regardless of
  // the filter below. reps: the same list, narrowed to one person when
  // Head picks an individual instead of leaving it on "Whole department".
  const allReps =
    isBackOffice(user)
      ? await prisma.user.findMany({
          where: { isActive: true, title: "Sales Manager" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [{ id: user.id, name: user.name ?? "Me" }];

  const selectedRepId = isBackOffice(user) ? (params.rep && params.rep !== "all" ? params.rep : null) : user.id;
  const reps = selectedRepId ? allReps.filter((r) => r.id === selectedRepId) : allReps;
  const repIds = reps.map((r) => r.id);

  // Trend window: the last TREND_MONTHS calendar months ending at the
  // current real-world month - independent of the month picker above, so
  // switching months to inspect one in detail doesn't shift the trend.
  const now = new Date();
  const trendMonths = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const idx = now.getUTCMonth() - (TREND_MONTHS - 1 - i);
    return new Date(Date.UTC(now.getUTCFullYear(), idx, 1));
  });
  const trendStart = trendMonths[0];
  const trendEnd = new Date(Date.UTC(trendMonths[TREND_MONTHS - 1].getUTCFullYear(), trendMonths[TREND_MONTHS - 1].getUTCMonth() + 1, 1));

  // Year-to-date window: Jan 1 of the selected month's year through the end
  // of the selected month. Always covers the whole department (allReps),
  // so the rep filter above doesn't hide anyone from the YTD breakdown.
  // For Head it covers every won deal in the window: the core sales team
  // individually and everyone else (historical staff, other divisions)
  // rolled up into "Others". Service sales are left out entirely - this is
  // sales tracking only, and Service has no individual target.
  const ytdMonths = Array.from({ length: month.getUTCMonth() + 1 }, (_, i) => new Date(Date.UTC(month.getUTCFullYear(), i, 1)));
  const ytdStart = ytdMonths[0];
  const allRepIds = allReps.map((r) => r.id);
  const serviceUsers =
    isBackOffice(user)
      ? await prisma.user.findMany({ where: { isActive: true, title: "Service Manager" }, select: { id: true } })
      : [];
  const serviceUserIds = serviceUsers.map((u) => u.id);

  const [targets, wonDeals, trendTargets, trendDeals, categoryLineItems, unitemizedCategoryDeals, ytdTargets, ytdDeals, ytdSummary] = await Promise.all([
    prisma.target.findMany({ where: { userId: { in: repIds }, month } }),
    prisma.deal.findMany({
      where: { ownerId: { in: repIds }, stage: "WON", closedAt: { gte: month, lt: nextMonth } },
      select: { ownerId: true, value: true },
    }),
    prisma.target.findMany({ where: { userId: { in: repIds }, month: { in: trendMonths } } }),
    prisma.deal.findMany({
      where: { ownerId: { in: repIds }, stage: "WON", closedAt: { gte: trendStart, lt: trendEnd } },
      select: { value: true, closedAt: true },
    }),
    // Category mix behind this month's actual - reuses the same product
    // categories as the Sales by Category report.
    prisma.saleLineItem.findMany({
      where: { ownerId: { in: repIds }, month: { gte: month, lt: nextMonth } },
      select: { value: true, product: { select: { category: true } } },
    }),
    // Deals won without a product breakup fall back to their Equipment
    // Type field, same as the Sales by Category report.
    prisma.deal.findMany({
      where: {
        ownerId: { in: repIds },
        stage: "WON",
        closedAt: { gte: month, lt: nextMonth },
        items: { none: {} },
        equipmentType: { not: null },
      },
      select: { value: true, equipmentType: true },
    }),
    prisma.target.findMany({
      where: { userId: { in: allRepIds }, month: { in: ytdMonths } },
      select: { userId: true, month: true, targetValue: true },
    }),
    prisma.deal.findMany({
      where: {
        ownerId: isBackOffice(user) ? { notIn: serviceUserIds } : user.id,
        stage: "WON",
        closedAt: { gte: ytdStart, lt: nextMonth },
      },
      select: { ownerId: true, value: true, closedAt: true },
    }),
    // Summary cards: follow the Sales Person filter (department or one rep).
    getYtdSummary(selectedRepId ? { kind: "rep", userId: selectedRepId } : { kind: "department" }, month),
  ]);
  // Project & Service billing counts toward achievement alongside Won deals.
  const [monthProjects, trendProjects, ytdProjects] = await Promise.all([
    getProjectBillings({ in: repIds }, month, nextMonth),
    getProjectBillings({ in: repIds }, trendStart, trendEnd),
    getProjectBillings(isBackOffice(user) ? { notIn: serviceUserIds } : user.id, ytdStart, nextMonth),
  ]);
  const targetByUserId = new Map(targets.map((t) => [t.userId, t.targetValue]));
  const actualByUserId = new Map<string, number>();
  for (const d of [...wonDeals, ...monthProjects]) {
    actualByUserId.set(d.ownerId, (actualByUserId.get(d.ownerId) ?? 0) + d.value);
  }

  // Forecast: open deals expected to close this month (in the current month,
  // also those already past their expected close date), by probability.
  const isCurrentMonth = monthValue(month) === monthValue(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const openDeals = await prisma.deal.findMany({
    where: {
      ownerId: { in: repIds },
      stage: { notIn: ["WON", "LOST"] },
      expectedCloseDate: isCurrentMonth ? { lt: nextMonth } : { gte: month, lt: nextMonth },
    },
    select: { ownerId: true, value: true, probability: true },
  });
  const forecastRows: ForecastRow[] = reps.map((r) => {
    const mine = openDeals.filter((d) => d.ownerId === r.id);
    return {
      userId: r.id,
      name: r.name,
      target: targetByUserId.get(r.id) ?? 0,
      won: actualByUserId.get(r.id) ?? 0,
      openCount: mine.length,
      openValue: mine.reduce((t, d) => t + d.value, 0),
      weighted: Math.round(mine.reduce((t, d) => t + (d.value * (d.probability ?? 0)) / 100, 0) * 100) / 100,
    };
  });

  const rows = reps.map((r) => ({
    name: r.name.split(" ")[0],
    target: targetByUserId.get(r.id) ?? 0,
    actual: actualByUserId.get(r.id) ?? 0,
  }));
  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);

  const trendTargetByMonth = new Map<string, number>();
  for (const t of trendTargets) {
    const key = monthValue(t.month);
    trendTargetByMonth.set(key, (trendTargetByMonth.get(key) ?? 0) + t.targetValue);
  }
  const trendActualByMonth = new Map<string, number>();
  for (const d of trendDeals) {
    if (!d.closedAt) continue;
    const key = monthValue(new Date(Date.UTC(d.closedAt.getUTCFullYear(), d.closedAt.getUTCMonth(), 1)));
    trendActualByMonth.set(key, (trendActualByMonth.get(key) ?? 0) + d.value);
  }
  for (const p of trendProjects) {
    const key = monthValue(new Date(Date.UTC(p.docDate.getUTCFullYear(), p.docDate.getUTCMonth(), 1)));
    trendActualByMonth.set(key, (trendActualByMonth.get(key) ?? 0) + p.value);
  }
  const trendRows: TargetTrendRow[] = trendMonths.map((m) => {
    const key = monthValue(m);
    return {
      month: shortMonthLabel(m),
      target: trendTargetByMonth.get(key) ?? 0,
      actual: trendActualByMonth.get(key) ?? 0,
    };
  });

  const categoryByName = new Map<string, number>();
  for (const li of categoryLineItems) {
    categoryByName.set(li.product.category, (categoryByName.get(li.product.category) ?? 0) + li.value);
  }
  for (const d of unitemizedCategoryDeals) {
    const key = EQUIPMENT_TYPE_LABELS[d.equipmentType!];
    categoryByName.set(key, (categoryByName.get(key) ?? 0) + d.value);
  }
  const categoryRows = Array.from(categoryByName.entries())
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value);

  // YTD rows: each core rep, then "Others" (Head only, and only when it has
  // something to show).
  type YtdRow = { key: string; name: string; ownerId: string | null; actual: number[]; target: number[] };
  const repRowByUserId = new Map<string, YtdRow>(
    allReps.map((r) => [r.id, { key: `rep_${r.id}`, name: r.name, ownerId: r.id, actual: ytdMonths.map(() => 0), target: ytdMonths.map(() => 0) }]),
  );
  const othersRow: YtdRow = { key: "others", name: "Others", ownerId: null, actual: ytdMonths.map(() => 0), target: ytdMonths.map(() => 0) };
  const ytdRowFor = (userId: string) => repRowByUserId.get(userId) ?? othersRow;
  for (const d of ytdDeals) {
    if (!d.closedAt) continue;
    ytdRowFor(d.ownerId).actual[d.closedAt.getUTCMonth()] += d.value;
  }
  for (const p of ytdProjects) {
    ytdRowFor(p.ownerId).actual[p.docDate.getUTCMonth()] += p.value;
  }
  for (const t of ytdTargets) {
    ytdRowFor(t.userId).target[t.month.getUTCMonth()] += t.targetValue;
  }
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const hasData = (r: YtdRow) => sum(r.actual) > 0 || sum(r.target) > 0;
  const ytdRepRows = [...repRowByUserId.values(), ...[othersRow].filter(hasData)].map((r) => ({
    ...r,
    totalActual: sum(r.actual),
    totalTarget: sum(r.target),
  }));
  const ytdMonthActual = ytdMonths.map((_, i) => sum(ytdRepRows.map((r) => r.actual[i])));
  const ytdMonthTarget = ytdMonths.map((_, i) => sum(ytdRepRows.map((r) => r.target[i])));
  const ytdTotalActual = sum(ytdMonthActual);
  const ytdTotalTarget = sum(ytdMonthTarget);

  const ytdSeries: YtdRepSeries[] = ytdRepRows.map((r) => ({ key: r.key, name: r.name }));
  const ytdChartRows: YtdRepChartRow[] = ytdMonths.map((m, i) => {
    const row: YtdRepChartRow = { month: m.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), target: ytdMonthTarget[i] };
    for (const r of ytdRepRows) row[r.key] = r.actual[i];
    return row;
  });
  const ytdYear = month.getUTCFullYear();
  const ytdRangeLabel = `Jan – ${month.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })} ${ytdYear}`;
  const ytdSummaryPct = achievementPct(ytdSummary.actual, ytdSummary.target);
  const ytdGrowthPct = growthPct(ytdSummary.actual, ytdSummary.lastYearActual);
  const lastYearRangeLabel = `${ytdSummary.lastYearStart.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${new Date(
    ytdSummary.lastYearEnd.getTime() - 1,
  ).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
  const pctLabel = (actual: number, target: number) => (target > 0 ? `${Math.round((actual / target) * 100)}%` : "—");

  const scopeLabel = isBackOffice(user) ? (selectedRepId ? reps[0]?.name : "whole department") : "your own sales";

  return (
    <div>
      <PageHeader
        title="Incentives & Targets"
        description={`Target vs. actual sales for ${monthLabel(month)} - ${scopeLabel}`}
        action={
          isBackOffice(user) ? (
            <Link href="/admin/import/targets" className="text-sm text-indigo-600 hover:text-indigo-700">
              Bulk upload targets →
            </Link>
          ) : undefined
        }
      />
      <div className="p-6 space-y-4">
        <PerfTabs active="targets" month={monthStr} />
        <form className="flex flex-wrap items-end gap-3" action="/targets">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
            <input
              type="month"
              name="month"
              defaultValue={monthStr}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {isBackOffice(user) && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Sales Person</label>
              <select
                name="rep"
                defaultValue={selectedRepId ?? "all"}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Whole department</option>
                {allReps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="submit"
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 transition-colors"
          >
            Go
          </button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-sm text-slate-500">YTD Target</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCompactCurrency(ytdSummary.target)}</p>
            <p className="text-xs text-slate-400 mt-1">{ytdRangeLabel}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-slate-500">YTD Achievement</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCompactCurrency(ytdSummary.actual)}</p>
            <p className="text-xs text-slate-400 mt-1">
              {ytdSummaryPct == null ? "No target set" : `${ytdSummaryPct}% of target`}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-slate-500">YTD vs Last Year</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {ytdGrowthPct == null ? "—" : `${ytdGrowthPct >= 0 ? "+" : ""}${ytdGrowthPct}%`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {formatCompactCurrency(ytdSummary.actual)} this year vs {formatCompactCurrency(ytdSummary.lastYearActual)}{" "}
              for {lastYearRangeLabel}
            </p>
          </Card>
          <Card className="p-4 flex items-center justify-center">
            <GaugeChart
              value={totalActual}
              target={totalTarget}
              valueLabel={formatCompactCurrency(totalActual)}
              targetLabel={formatCompactCurrency(totalTarget)}
            />
          </Card>
        </div>

        {(isCurrentMonth || month > now) && (
          <Card className="p-5">
            <ForecastTable rows={forecastRows} monthLabel={monthLabel(month)} isCurrent={isCurrentMonth} monthParam={monthStr} />
          </Card>
        )}

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Target vs. Actual, per sales rep</h2>
          <TargetChart data={rows} />
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-slate-900">Monthly trend</h2>
              <span className="text-xs text-slate-400">Last {TREND_MONTHS} months</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">Target vs. actual sales, {scopeLabel}.</p>
            <TargetTrendChart data={trendRows} />
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-slate-900">This month&apos;s sales by category</h2>
              <Link href="/reports/sales-register" className="text-xs text-indigo-600 hover:text-indigo-700">
                Full category report →
              </Link>
            </div>
            <p className="text-xs text-slate-500 mb-3">{monthLabel(month)}, {scopeLabel}.</p>
            {categoryRows.length === 0 ? (
              <EmptyState title="No sales recorded this month" />
            ) : (
              <CategoryChart data={categoryRows} />
            )}
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-end p-4 pb-0">
            <ExportCsvButton
              filename={`targets-${monthStr}.csv`}
              headers={["Sales Rep", "Target", "Actual", "Achievement %"]}
              rows={reps.map((r) => {
                const target = targetByUserId.get(r.id) ?? 0;
                const actual = actualByUserId.get(r.id) ?? 0;
                const pct = target > 0 ? Math.round((actual / target) * 100) : "";
                return [r.name, target, actual, pct];
              })}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Sales Rep</th>
                  <th className="px-4 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 font-medium">Actual</th>
                  <th className="px-4 py-3 font-medium">Achievement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reps.map((r) => {
                  const target = targetByUserId.get(r.id) ?? 0;
                  const actual = actualByUserId.get(r.id) ?? 0;
                  const pct = target > 0 ? Math.round((actual / target) * 100) : null;
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-slate-600">{formatCurrency(target)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {actual > 0 ? (
                          <Link
                            href={`/deals/closed?stage=WON&month=${monthStr}&owner=${r.id}`}
                            className="text-indigo-600 hover:text-indigo-700"
                          >
                            {formatCurrency(actual)}
                          </Link>
                        ) : (
                          formatCurrency(actual)
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{pct == null ? "—" : `${pct}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-900">
              {isBackOffice(user) ? "Department sales YTD, by sales person" : "Your sales YTD"}
            </h2>
            <span className="text-xs text-slate-400">{ytdRangeLabel}</span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Won sales per month, stacked by sales person, against the combined monthly target. YTD actual{" "}
            {formatCompactCurrency(ytdTotalActual)} of {formatCompactCurrency(ytdTotalTarget)} target (
            {pctLabel(ytdTotalActual, ytdTotalTarget)}).
          </p>
          <YtdRepChart data={ytdChartRows} series={ytdSeries} />
        </Card>

        <Card>
          <div className="flex items-center justify-between p-4 pb-0">
            <h2 className="text-sm font-semibold text-slate-900">YTD sales by month - {ytdRangeLabel}</h2>
            <ExportCsvButton
              filename={`ytd-sales-${ytdYear}-${monthStr}.csv`}
              headers={[
                "Sales Person",
                ...ytdMonths.map((m) => shortMonthLabel(m)),
                "YTD Actual",
                "YTD Target",
                "Achievement %",
              ]}
              rows={[
                ...ytdRepRows.map((r) => [
                  r.name,
                  ...r.actual,
                  r.totalActual,
                  r.totalTarget,
                  r.totalTarget > 0 ? Math.round((r.totalActual / r.totalTarget) * 100) : "",
                ]),
                [
                  "Department total",
                  ...ytdMonthActual,
                  ytdTotalActual,
                  ytdTotalTarget,
                  ytdTotalTarget > 0 ? Math.round((ytdTotalActual / ytdTotalTarget) * 100) : "",
                ],
              ]}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium sticky left-0 bg-white">Sales Person</th>
                  {ytdMonths.map((m) => (
                    <th key={m.toISOString()} className="px-3 py-3 font-medium text-right">
                      {m.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
                    </th>
                  ))}
                  <th className="px-3 py-3 font-medium text-right">YTD Actual</th>
                  <th className="px-3 py-3 font-medium text-right">YTD Target</th>
                  <th className="px-4 py-3 font-medium text-right">Achievement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ytdRepRows.map((r) => (
                  <tr key={r.key}>
                    <td className="px-4 py-3 font-medium text-slate-800 sticky left-0 bg-white">{r.name}</td>
                    {r.actual.map((v, i) => (
                      <td key={i} className="px-3 py-3 text-right text-slate-600 tabular-nums">
                        {v > 0 && r.ownerId ? (
                          <Link
                            href={`/deals/closed?stage=WON&month=${monthValue(ytdMonths[i])}&owner=${r.ownerId}`}
                            className="text-indigo-600 hover:text-indigo-700"
                          >
                            {formatCompactCurrency(v)}
                          </Link>
                        ) : v > 0 ? (
                          formatCompactCurrency(v)
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right font-medium text-slate-800 tabular-nums">
                      {formatCompactCurrency(r.totalActual)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600 tabular-nums">{formatCompactCurrency(r.totalTarget)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{pctLabel(r.totalActual, r.totalTarget)}</td>
                  </tr>
                ))}
              </tbody>
              {ytdRepRows.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                    <td className="px-4 py-3 sticky left-0 bg-slate-50">Department total</td>
                    {ytdMonthActual.map((v, i) => (
                      <td key={i} className="px-3 py-3 text-right tabular-nums">
                        {v > 0 ? formatCompactCurrency(v) : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right tabular-nums">{formatCompactCurrency(ytdTotalActual)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatCompactCurrency(ytdTotalTarget)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{pctLabel(ytdTotalActual, ytdTotalTarget)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>

        {isBackOffice(user) && (
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Set a target</h2>
            <p className="text-xs text-slate-500 mb-4">
              For a one-off change. To set targets for the whole team at once, use the bulk upload above.
            </p>
            <SetTargetForm reps={allReps} month={monthStr} />
          </Card>
        )}
      </div>
    </div>
  );
}
