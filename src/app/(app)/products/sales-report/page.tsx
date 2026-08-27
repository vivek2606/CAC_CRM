import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatCompactCurrency } from "@/lib/format";
import { CategoryChart } from "../category-chart";

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function SalesByCategoryPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; month?: string; year?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const mode = params.mode === "year" ? "year" : "month";

  let rangeStart: Date;
  let rangeEnd: Date;
  let periodLabel: string;
  let monthValue = params.month ?? currentMonthValue();
  let yearValue = params.year ?? String(new Date().getUTCFullYear());

  if (mode === "year") {
    const year = Number(yearValue) || new Date().getUTCFullYear();
    yearValue = String(year);
    rangeStart = new Date(Date.UTC(year, 0, 1));
    rangeEnd = new Date(Date.UTC(year + 1, 0, 1));
    periodLabel = yearValue;
  } else {
    const m = monthValue.match(/^(\d{4})-(\d{1,2})$/);
    const year = m ? Number(m[1]) : new Date().getUTCFullYear();
    const monthIdx = m ? Number(m[2]) - 1 : new Date().getUTCMonth();
    monthValue = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
    rangeStart = new Date(Date.UTC(year, monthIdx, 1));
    rangeEnd = new Date(Date.UTC(year, monthIdx + 1, 1));
    periodLabel = monthLabel(rangeStart);
  }

  const lineItems = await prisma.saleLineItem.findMany({
    where: { month: { gte: rangeStart, lt: rangeEnd } },
    select: { value: true, qty: true, product: { select: { category: true } } },
  });

  const byCategory = new Map<string, { value: number; qty: number }>();
  for (const li of lineItems) {
    const key = li.product.category;
    const existing = byCategory.get(key) ?? { value: 0, qty: 0 };
    existing.value += li.value;
    existing.qty += li.qty;
    byCategory.set(key, existing);
  }
  const rows = Array.from(byCategory.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.value - a.value);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div>
      <PageHeader
        title="Sales by Category"
        description={`Sales value by product category for ${periodLabel}`}
        action={
          <Link href="/products" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← Products
          </Link>
        }
      />
      <div className="p-6 space-y-4">
        <form className="flex flex-wrap items-end gap-3" action="/products/sales-report">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">View by</label>
            <select
              name="mode"
              defaultValue={mode}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </div>
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
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Sales value by category</h2>
          {rows.length === 0 ? (
            <EmptyState title="No sales in this period" description="Try a different month or year." />
          ) : (
            <CategoryChart data={rows.map((r) => ({ category: r.category, value: r.value }))} />
          )}
        </Card>

        {rows.length > 0 && (
          <Card>
            <div className="overflow-x-auto">
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
          </Card>
        )}
      </div>
    </div>
  );
}
