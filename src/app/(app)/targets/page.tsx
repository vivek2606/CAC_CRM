import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatCompactCurrency } from "@/lib/format";
import { TargetChart } from "./target-chart";
import { TargetTrendChart, type TargetTrendRow } from "./target-trend-chart";
import { SetTargetForm } from "./set-target-form";
import { ExportCsvButton } from "@/components/export-csv-button";
import { CategoryChart } from "../reports/category-chart";
import { EQUIPMENT_TYPE_LABELS } from "@/lib/constants";
import { GaugeChart } from "@/components/gauge-chart";

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
    user.role === "HEAD"
      ? await prisma.user.findMany({
          where: { isActive: true, title: "Sales Manager" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [{ id: user.id, name: user.name ?? "Me" }];

  const selectedRepId = user.role === "HEAD" ? (params.rep && params.rep !== "all" ? params.rep : null) : user.id;
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

  const [targets, wonDeals, trendTargets, trendDeals, categoryLineItems, unitemizedCategoryDeals] = await Promise.all([
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
  ]);
  const targetByUserId = new Map(targets.map((t) => [t.userId, t.targetValue]));
  const actualByUserId = new Map<string, number>();
  for (const d of wonDeals) {
    actualByUserId.set(d.ownerId, (actualByUserId.get(d.ownerId) ?? 0) + d.value);
  }

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

  const scopeLabel = user.role === "HEAD" ? (selectedRepId ? reps[0]?.name : "whole department") : "your own sales";

  return (
    <div>
      <PageHeader
        title="Targets"
        description={`Target vs. actual sales for ${monthLabel(month)} - ${scopeLabel}`}
        action={
          user.role === "HEAD" ? (
            <Link href="/admin/import/targets" className="text-sm text-indigo-600 hover:text-indigo-700">
              Bulk upload targets →
            </Link>
          ) : undefined
        }
      />
      <div className="p-6 space-y-4">
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
          {user.role === "HEAD" && (
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <p className="text-sm text-slate-500">Total Target</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCompactCurrency(totalTarget)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-slate-500">Total Actual</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCompactCurrency(totalActual)}</p>
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
              <Link href="/reports/category" className="text-xs text-indigo-600 hover:text-indigo-700">
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

        {user.role === "HEAD" && (
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
