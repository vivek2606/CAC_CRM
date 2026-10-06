import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatCompactCurrency } from "@/lib/format";
import { ExportCsvButton } from "@/components/export-csv-button";
import {
  calculateSalesIncentive,
  distributeSupportPool,
  COORDINATOR_FIRST_SHARE,
  SALES_PERSON_SHARE,
  SUPPORT_POOL_SHARE,
} from "@/lib/incentive";

function parseMonth(raw: string | undefined): Date {
  const m = raw?.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  // Default: last month - incentives are worked out once a month has closed.
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
}
const monthValue = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const pct = (a: number | null) => (a == null ? "—" : `${(a * 100).toFixed(1)}%`);
// Whole naira in the table so every column fits; the CSV keeps kobo.
const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const ratePct = (r: number) => (r > 0 ? `${(r * 100).toFixed(1)}%` : "Not eligible");

export default async function IncentivesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const isHead = user.role === "HEAD";
  const month = parseMonth((await searchParams).month);
  const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const now = new Date();
  const inProgress = nextMonth > now;

  // Same sales team and Won-sales measure as the Targets page, so the
  // achievement here matches what reps see there.
  const reps = isHead
    ? await prisma.user.findMany({
        where: { isActive: true, title: "Sales Manager" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [{ id: user.id, name: user.name ?? "Me" }];
  const repIds = reps.map((r) => r.id);
  const [targets, sales] = await Promise.all([
    prisma.target.findMany({ where: { userId: { in: repIds }, month }, select: { userId: true, targetValue: true } }),
    prisma.deal.groupBy({
      by: ["ownerId"],
      where: { ownerId: { in: repIds }, stage: "WON", closedAt: { gte: month, lt: nextMonth } },
      _sum: { value: true },
    }),
  ]);
  const targetBy = new Map(targets.map((t) => [t.userId, t.targetValue]));
  const salesBy = new Map(sales.map((s) => [s.ownerId, s._sum.value ?? 0]));

  const rows = reps.map((r) =>
    calculateSalesIncentive({ userId: r.id, name: r.name, target: targetBy.get(r.id) ?? 0, sales: salesBy.get(r.id) ?? 0 }),
  );
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalIncentive = rows.reduce((s, r) => s + r.incentive, 0);
  const totalPayout = rows.reduce((s, r) => s + r.payout, 0);
  const pool = rows.reduce((s, r) => s + r.toPool, 0);
  const support = distributeSupportPool(pool);
  const eligible = rows.filter((r) => r.rate > 0).length;

  const csvRows: (string | number)[][] = [
    ...rows.map((r) => [
      "Sales",
      r.name,
      Math.round(r.target),
      Math.round(r.sales),
      r.achievement == null ? "" : Math.round(r.achievement * 1000) / 10,
      r.rate * 100,
      Math.round(r.incentive * 100) / 100,
      Math.round(r.payout * 100) / 100,
      Math.round(r.toPool * 100) / 100,
    ]),
    ...(isHead ? support.map((s) => ["Support", `${s.name} (${s.role})`, "", "", "", "", "", Math.round(s.amount * 100) / 100, ""]) : []),
  ];

  return (
    <div>
      <PageHeader
        title="Incentives"
        description={`Monthly sales incentive - ${monthLabel(month)}${inProgress ? " (month still running - provisional)" : ""}`}
        action={
          <Link href="/targets" className="text-sm text-indigo-600 hover:text-indigo-700">
            Targets →
          </Link>
        }
      />
      <div className="p-6 space-y-4">
        <form className="flex flex-wrap items-end gap-3" action="/incentives">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
            <input
              type="month"
              name="month"
              defaultValue={monthValue(month)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700">
            Calculate
          </button>
        </form>

        <Card className="p-4 text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-800">How it&apos;s calculated: </span>
          achievement = the month&apos;s Won sales ÷ target. 100% or more earns <b>0.5%</b> of the month&apos;s sales; 90% up to
          100% earns <b>0.4%</b>; below 90% (or no target) isn&apos;t eligible. Each eligible sales person keeps{" "}
          {SALES_PERSON_SHARE * 100}% and shares {SUPPORT_POOL_SHARE * 100}% with support staff: the Sales Coordinator gets the
          first {formatCurrency(COORDINATOR_FIRST_SHARE)}, and the balance is split equally among the other support staff.
        </Card>

        {isHead && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-sm text-slate-500">Eligible sales people</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">
                {eligible} of {rows.length}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-slate-500">Total incentive</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCurrency(totalIncentive)}</p>
              <p className="text-xs text-slate-400 mt-1">on {formatCurrency(totalSales)} sales</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-slate-500">Paid to sales people (80%)</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCurrency(totalPayout)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-slate-500">Support staff pool (20%)</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCurrency(pool)}</p>
            </Card>
          </div>
        )}

        <Card>
          <div className="flex items-center justify-between p-4 pb-0">
            <h2 className="text-sm font-semibold text-slate-900">Sales team</h2>
            <ExportCsvButton
              filename={`incentives-${monthValue(month)}.csv`}
              headers={["Type", "Name", "Target", "Sales", "Achievement %", "Rate %", "Incentive", "Payout", "To support pool"]}
              rows={csvRows}
            />
          </div>
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No sales team found" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">Sales person</th>
                    <th className="px-3 py-3 font-medium text-right">Target</th>
                    <th className="px-3 py-3 font-medium text-right">Sales</th>
                    <th className="px-3 py-3 font-medium text-right">Achievement</th>
                    <th className="px-3 py-3 font-medium text-right">Rate</th>
                    <th className="px-3 py-3 font-medium text-right">Incentive</th>
                    <th className="px-3 py-3 font-medium text-right">Payout (80%)</th>
                    <th className="px-4 py-3 font-medium text-right">To support (20%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.userId}>
                      <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                        {r.target > 0 ? formatCompactCurrency(r.target) : <span className="text-slate-400">No target</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700" title={formatCurrency(r.sales)}>
                        {formatCompactCurrency(r.sales)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right tabular-nums font-medium ${
                          r.achievement == null
                            ? "text-slate-400"
                            : r.achievement >= 1
                              ? "text-emerald-600"
                              : r.achievement >= 0.9
                                ? "text-amber-600"
                                : "text-rose-600"
                        }`}
                      >
                        {pct(r.achievement)}
                      </td>
                      <td className={`px-3 py-3 text-right ${r.rate > 0 ? "text-slate-700" : "text-slate-400"}`}>{ratePct(r.rate)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{naira(r.incentive)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-slate-900">{naira(r.payout)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{naira(r.toPool)}</td>
                    </tr>
                  ))}
                </tbody>
                {isHead && rows.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-3 py-3" />
                      <td className="px-3 py-3 text-right tabular-nums">{formatCompactCurrency(totalSales)}</td>
                      <td className="px-3 py-3" colSpan={2} />
                      <td className="px-3 py-3 text-right tabular-nums">{naira(totalIncentive)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{naira(totalPayout)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{naira(pool)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>

        {isHead && (
          <Card>
            <div className="p-4 pb-0">
              <h2 className="text-sm font-semibold text-slate-900">Support staff share</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pool of {formatCurrency(pool)}: the Sales Coordinator takes the first {formatCurrency(COORDINATOR_FIRST_SHARE)}
                {pool > COORDINATOR_FIRST_SHARE
                  ? `, and the remaining ${formatCurrency(pool - COORDINATOR_FIRST_SHARE)} is split equally among the other three.`
                  : pool > 0
                    ? " - the pool is below that, so it all goes to the Sales Coordinator this month."
                    : " - no one was eligible this month, so there's nothing to share."}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {support.map((s) => (
                    <tr key={s.name}>
                      <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                      <td className="px-4 py-3 text-slate-600">{s.role}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{formatCurrency(s.amount)}</td>
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
