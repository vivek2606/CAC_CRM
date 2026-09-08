import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatCompactCurrency } from "@/lib/format";
import { CategoryChart } from "../category-chart";
import { CategoryYearCompareChart, type CategoryYearRow } from "../category-year-chart";
import { CategoryTrendChart, type CategoryTrendRow } from "../category-trend-chart";
import { ExportCsvButton } from "@/components/export-csv-button";
import { ResyncCategoryButton } from "../resync-category-button";
import { EQUIPMENT_TYPE_LABELS } from "@/lib/constants";
import { assignCategoryColors, CATEGORY_OTHER_COLOR, OTHER_CATEGORY_LABEL, MAX_CATEGORY_SLOTS } from "@/lib/category-colors";

type Mode = "month" | "year" | "compare";

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function shortMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

const MAX_COMPARE_YEARS = 6;
const TREND_MONTHS = 6;

export default async function CategoryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; month?: string; year?: string; fromYear?: string; toYear?: string; rep?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const mode: Mode = params.mode === "year" ? "year" : params.mode === "compare" ? "compare" : "month";
  const currentYear = new Date().getUTCFullYear();

  // Sales-person scoping: a rep only ever sees their own numbers; the Head
  // can pick any one active rep, or leave it on "All Reps" for the
  // company-wide total (which intentionally includes historical/inactive
  // reps' sales too, not just the current 6).
  const reps =
    user.role === "HEAD"
      ? await prisma.user.findMany({
          where: { isActive: true, title: "Sales Manager" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [];
  const selectedRepId = user.role === "HEAD" ? (params.rep && params.rep !== "all" ? params.rep : null) : user.id;
  const selectedRepName =
    user.role === "HEAD" ? reps.find((r) => r.id === selectedRepId)?.name : (user.name ?? "Me");

  const ownerWhere = selectedRepId ? { ownerId: selectedRepId } : {};

  // Composition-over-time trend (stacked column) - shown on every mode,
  // independent of the month/year filter above, same as Targets' own
  // 6/12-month trend chart alongside its current-period view.
  const now = new Date();
  const trendMonths = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const idx = now.getUTCMonth() - (TREND_MONTHS - 1 - i);
    return new Date(Date.UTC(now.getUTCFullYear(), idx, 1));
  });
  const trendStart = trendMonths[0];
  const trendEnd = new Date(Date.UTC(trendMonths[TREND_MONTHS - 1].getUTCFullYear(), trendMonths[TREND_MONTHS - 1].getUTCMonth() + 1, 1));

  const [trendLineItems, trendUnitemizedDeals] = await Promise.all([
    prisma.saleLineItem.findMany({
      where: { month: { gte: trendStart, lt: trendEnd }, ...ownerWhere },
      select: { value: true, month: true, product: { select: { category: true } } },
    }),
    prisma.deal.findMany({
      where: {
        stage: "WON",
        closedAt: { gte: trendStart, lt: trendEnd },
        items: { none: {} },
        equipmentType: { not: null },
        ...ownerWhere,
      },
      select: { value: true, equipmentType: true, closedAt: true },
    }),
  ]);

  const trendByMonthCategory = new Map<string, Map<string, number>>();
  const totalByCategory = new Map<string, number>();
  function addToTrend(monthKey: string, category: string, value: number) {
    const byCat = trendByMonthCategory.get(monthKey) ?? new Map<string, number>();
    byCat.set(category, (byCat.get(category) ?? 0) + value);
    trendByMonthCategory.set(monthKey, byCat);
    totalByCategory.set(category, (totalByCategory.get(category) ?? 0) + value);
  }
  for (const li of trendLineItems) {
    const key = `${li.month.getUTCFullYear()}-${String(li.month.getUTCMonth() + 1).padStart(2, "0")}`;
    addToTrend(key, li.product.category, li.value);
  }
  for (const d of trendUnitemizedDeals) {
    const c = d.closedAt!;
    const key = `${c.getUTCFullYear()}-${String(c.getUTCMonth() + 1).padStart(2, "0")}`;
    addToTrend(key, EQUIPMENT_TYPE_LABELS[d.equipmentType!], d.value);
  }

  // Rank categories largest-first, fold anything past the palette's slot
  // count into "Other" rather than generating a new hue.
  const rankedCategories = Array.from(totalByCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category]) => category);
  const trendColorByCategory = assignCategoryColors(rankedCategories);
  const trendCategories = rankedCategories.slice(0, MAX_CATEGORY_SLOTS);
  const hasOther = rankedCategories.length > MAX_CATEGORY_SLOTS;
  const trendChartCategories = hasOther ? [...trendCategories, OTHER_CATEGORY_LABEL] : trendCategories;

  const trendData: CategoryTrendRow[] = trendMonths.map((m) => {
    const key = `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`;
    const byCat = trendByMonthCategory.get(key) ?? new Map<string, number>();
    const row: CategoryTrendRow = { month: shortMonthLabel(m) };
    for (const cat of trendCategories) row[cat] = byCat.get(cat) ?? 0;
    if (hasOther) {
      let other = 0;
      for (const [cat, val] of byCat) if (!trendCategories.includes(cat)) other += val;
      row[OTHER_CATEGORY_LABEL] = other;
    }
    return row;
  });

  // Recharts' chart is a Client Component, so this needs to be a plain
  // serializable object crossing the Server -> Client boundary, not a
  // function.
  const trendColors: Record<string, string> = { [OTHER_CATEGORY_LABEL]: CATEGORY_OTHER_COLOR };
  for (const [cat, color] of trendColorByCategory) trendColors[cat] = color;

  if (mode === "compare") {
    let fromYear = Number(params.fromYear) || currentYear - 2;
    let toYear = Number(params.toYear) || currentYear;
    if (fromYear > toYear) [fromYear, toYear] = [toYear, fromYear];
    if (toYear - fromYear + 1 > MAX_COMPARE_YEARS) toYear = fromYear + MAX_COMPARE_YEARS - 1;
    const years = Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i);

    const rangeStart = new Date(Date.UTC(fromYear, 0, 1));
    const rangeEnd = new Date(Date.UTC(toYear + 1, 0, 1));

    const [lineItems, unitemizedDeals] = await Promise.all([
      prisma.saleLineItem.findMany({
        where: { month: { gte: rangeStart, lt: rangeEnd }, ...ownerWhere },
        select: { value: true, month: true, product: { select: { category: true } } },
      }),
      // Deals won without a product breakup have no SaleLineItem rows to
      // group by product category - fall back to the deal's own Equipment
      // Type field so they still count somewhere instead of vanishing.
      prisma.deal.findMany({
        where: {
          stage: "WON",
          closedAt: { gte: rangeStart, lt: rangeEnd },
          items: { none: {} },
          equipmentType: { not: null },
          ...ownerWhere,
        },
        select: { value: true, equipmentType: true, closedAt: true },
      }),
    ]);

    const byCategory = new Map<string, Record<number, number>>();
    for (const li of lineItems) {
      const year = li.month.getUTCFullYear();
      const key = li.product.category;
      const existing = byCategory.get(key) ?? {};
      existing[year] = (existing[year] ?? 0) + li.value;
      byCategory.set(key, existing);
    }
    for (const d of unitemizedDeals) {
      const year = d.closedAt!.getUTCFullYear();
      const key = EQUIPMENT_TYPE_LABELS[d.equipmentType!];
      const existing = byCategory.get(key) ?? {};
      existing[year] = (existing[year] ?? 0) + d.value;
      byCategory.set(key, existing);
    }
    const rows: CategoryYearRow[] = Array.from(byCategory.entries())
      .map(([category, byYear]) => {
        const row: CategoryYearRow = { category };
        for (const y of years) row[String(y)] = byYear[y] ?? 0;
        return row;
      })
      .sort((a, b) => {
        const totalA = years.reduce((s, y) => s + Number(a[String(y)] ?? 0), 0);
        const totalB = years.reduce((s, y) => s + Number(b[String(y)] ?? 0), 0);
        return totalB - totalA;
      });
    const totalValue =
      lineItems.reduce((s, li) => s + li.value, 0) + unitemizedDeals.reduce((s, d) => s + d.value, 0);

    return (
      <CategoryReportShell
        user={user}
        reps={reps}
        selectedRepId={selectedRepId}
        selectedRepName={selectedRepName}
        mode={mode}
        monthValue={currentMonthValue()}
        yearValue={String(currentYear)}
        fromYear={fromYear}
        toYear={toYear}
        periodLabel={`${fromYear}–${toYear}`}
        totalValue={totalValue}
        trendData={trendData}
        trendCategories={trendChartCategories}
        trendColors={trendColors}
      >
        {rows.length === 0 ? (
          <EmptyState title="No sales in this period" description="Try a different year range." />
        ) : (
          <CategoryYearCompareChart data={rows} years={years} />
        )}
      </CategoryReportShell>
    );
  }

  // month / year modes
  let rangeStart: Date;
  let rangeEnd: Date;
  let periodLabel: string;
  let monthValue = params.month ?? currentMonthValue();
  let yearValue = params.year ?? String(currentYear);

  if (mode === "year") {
    const year = Number(yearValue) || currentYear;
    yearValue = String(year);
    rangeStart = new Date(Date.UTC(year, 0, 1));
    rangeEnd = new Date(Date.UTC(year + 1, 0, 1));
    periodLabel = yearValue;
  } else {
    const m = monthValue.match(/^(\d{4})-(\d{1,2})$/);
    const year = m ? Number(m[1]) : currentYear;
    const monthIdx = m ? Number(m[2]) - 1 : new Date().getUTCMonth();
    monthValue = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
    rangeStart = new Date(Date.UTC(year, monthIdx, 1));
    rangeEnd = new Date(Date.UTC(year, monthIdx + 1, 1));
    periodLabel = monthLabel(rangeStart);
  }

  const [lineItems, unitemizedDeals] = await Promise.all([
    prisma.saleLineItem.findMany({
      where: { month: { gte: rangeStart, lt: rangeEnd }, ...ownerWhere },
      select: { value: true, qty: true, product: { select: { category: true } } },
    }),
    // Deals won without a product breakup have no SaleLineItem rows to
    // group by product category - fall back to the deal's own Equipment
    // Type field so they still count somewhere instead of vanishing.
    prisma.deal.findMany({
      where: {
        stage: "WON",
        closedAt: { gte: rangeStart, lt: rangeEnd },
        items: { none: {} },
        equipmentType: { not: null },
        ...ownerWhere,
      },
      select: { value: true, equipmentType: true },
    }),
  ]);

  const byCategory = new Map<string, { value: number; qty: number }>();
  for (const li of lineItems) {
    const key = li.product.category;
    const existing = byCategory.get(key) ?? { value: 0, qty: 0 };
    existing.value += li.value;
    existing.qty += li.qty;
    byCategory.set(key, existing);
  }
  for (const d of unitemizedDeals) {
    const key = EQUIPMENT_TYPE_LABELS[d.equipmentType!];
    const existing = byCategory.get(key) ?? { value: 0, qty: 0 };
    existing.value += d.value;
    byCategory.set(key, existing);
  }
  const rows = Array.from(byCategory.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.value - a.value);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  return (
    <CategoryReportShell
      user={user}
      reps={reps}
      selectedRepId={selectedRepId}
      selectedRepName={selectedRepName}
      mode={mode}
      monthValue={monthValue}
      yearValue={yearValue}
      fromYear={currentYear - 2}
      toYear={currentYear}
      periodLabel={periodLabel}
      totalValue={totalValue}
      trendData={trendData}
      trendCategories={trendChartCategories}
      trendColors={trendColors}
    >
      {rows.length === 0 ? (
        <EmptyState title="No sales in this period" description="Try a different month or year." />
      ) : (
        <>
          <CategoryChart data={rows.map((r) => ({ category: r.category, value: r.value }))} />
          <div className="flex justify-end mt-4">
            <ExportCsvButton
              filename={`sales-by-category-${periodLabel.replace(/\s+/g, "-")}.csv`}
              headers={["Category", "Qty", "Sales Value", "Share %"]}
              rows={rows.map((r) => [
                r.category,
                r.qty,
                r.value,
                totalValue > 0 ? Math.round((r.value / totalValue) * 100) : 0,
              ])}
            />
          </div>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Sales Value</th>
                  <th className="px-4 py-3 font-medium">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.category}>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.category}</td>
                    <td className="px-4 py-3 text-slate-600">{r.qty.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">{formatCurrency(r.value)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {totalValue > 0 ? `${Math.round((r.value / totalValue) * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </CategoryReportShell>
  );
}

function CategoryReportShell({
  user,
  reps,
  selectedRepId,
  selectedRepName,
  mode,
  monthValue,
  yearValue,
  fromYear,
  toYear,
  periodLabel,
  totalValue,
  trendData,
  trendCategories,
  trendColors,
  children,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  reps: { id: string; name: string }[];
  selectedRepId: string | null;
  selectedRepName: string | undefined;
  mode: Mode;
  monthValue: string;
  yearValue: string;
  fromYear: number;
  toYear: number;
  periodLabel: string;
  totalValue: number;
  trendData: CategoryTrendRow[];
  trendCategories: string[];
  trendColors: Record<string, string>;
  children: ReactNode;
}) {
  const scopeLabel = user.role === "HEAD" ? (selectedRepId ? `for ${selectedRepName}` : "company-wide") : "for your own sales";

  return (
    <div>
      <PageHeader
        title="Sales by Category"
        description={`Sales value by product category, ${scopeLabel}`}
        action={
          user.role === "HEAD" ? (
            <Link href="/reports" className="text-sm text-indigo-600 hover:text-indigo-700">
              ← Team Reports
            </Link>
          ) : undefined
        }
      />
      <div className="p-6 space-y-4">
        {user.role === "HEAD" && (
          <div className="flex justify-end">
            <ResyncCategoryButton />
          </div>
        )}
        <form className="flex flex-wrap items-end gap-3" action="/reports/category">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">View by</label>
            <select
              name="mode"
              defaultValue={mode}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="month">Month</option>
              <option value="year">Year</option>
              <option value="compare">Compare Years</option>
            </select>
          </div>
          {mode === "compare" ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">From Year</label>
                <input
                  type="number"
                  name="fromYear"
                  defaultValue={fromYear}
                  min="2020"
                  max="2100"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">To Year</label>
                <input
                  type="number"
                  name="toYear"
                  defaultValue={toYear}
                  min="2020"
                  max="2100"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
                <input
                  type="month"
                  name="month"
                  defaultValue={monthValue}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Year</label>
                <input
                  type="number"
                  name="year"
                  defaultValue={yearValue}
                  min="2020"
                  max="2100"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </>
          )}
          {user.role === "HEAD" && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Sales Person</label>
              <select
                name="rep"
                defaultValue={selectedRepId ?? "all"}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Reps</option>
                {reps.map((r) => (
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

        <Card className="p-4">
          <p className="text-sm text-slate-500">Total sales value, {periodLabel}</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCompactCurrency(totalValue)}</p>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Category mix, last 6 months</h2>
          <p className="text-xs text-slate-400 mb-3">How each category&apos;s share of sales has been trending</p>
          {trendData.every((row) => trendCategories.every((c) => (row[c] ?? 0) === 0)) ? (
            <EmptyState title="No sales in the last 6 months" />
          ) : (
            <CategoryTrendChart data={trendData} categories={trendCategories} colors={trendColors} />
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Sales value by category</h2>
          {children}
        </Card>
      </div>
    </div>
  );
}
