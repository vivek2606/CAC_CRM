import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { formatUsdCompact, formatNumber } from "@/lib/format";
import { SALES_TITLE_IN } from "@/lib/team-titles";
import { getStudioViews } from "@/lib/studio-views";
import { getUsdSales } from "@/lib/usd-sales";
import { TeamTabs } from "../team-tabs";
import { TargetTrendChart } from "../../targets/target-trend-chart";

// Sales in USD: the month and the year to date against target and the same
// period last year, the last 12 months, each sales person and each product
// category - converted at each month's exchange rate.

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const growth = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
const pctText = (p: number | null) => (p == null ? "—" : `${p}%`);
const growthText = (p: number | null) => (p == null ? "—" : `${p >= 0 ? "+" : ""}${p}%`);
const achTone = (p: number | null) => (p == null ? "text-slate-400" : p >= 100 ? "text-emerald-700" : p >= 80 ? "text-amber-700" : "text-rose-700");
// "2024-11", "2024-12", "2025-01", "2025-03" -> "Nov 2024 – Jan 2025, Mar 2025".
function monthRanges(keys: string[]): string {
  const idx = (k: string) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5)) - 1;
  const name = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  const out: string[] = [];
  let start = keys[0];
  keys.forEach((k, i) => {
    const next = keys[i + 1];
    if (next && idx(next) === idx(k) + 1) return;
    out.push(start === k ? name(k) : `${name(start)} – ${name(k)}`);
    start = next;
  });
  return out.join(", ");
}
const growthTone = (p: number | null) => (p == null ? "text-slate-400" : p >= 0 ? "text-emerald-700" : "text-rose-700");

export default async function UsdSalesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireBackOffice();
  const sp = await searchParams;
  const now = new Date();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const reps = await prisma.user.findMany({ where: { isActive: true, title: SALES_TITLE_IN }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const [u, tabs] = await Promise.all([getUsdSales(month, reps), getStudioViews("team", user.id)]);
  const c = u.current;
  const y = Number(month.slice(0, 4));
  const th = "py-1.5 pr-3 text-xs font-medium uppercase tracking-wide text-slate-400";
  const num = "py-1.5 pr-3 text-right tabular-nums";
  const tile = (label: string, value: string, sub: React.ReactNode) => (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
  const totals = u.categories.reduce((t, x) => ({ month: t.month + x.month, monthLy: t.monthLy + x.monthLy, ytd: t.ytd + x.ytd, ytdLy: t.ytdLy + x.ytdLy }), { month: 0, monthLy: 0, ytd: 0, ytdLy: 0 });

  return (
    <div>
      <PageHeader title="Team Reports" description={`Sales in USD - ${u.monthLabel}`} />
      <TeamTabs tabs={tabs} active="usd" />
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <form action="/reports/usd" className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">Month</span>
            <input type="month" name="month" defaultValue={month} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          </label>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Show
          </button>
          <a href={`/reports/usd/xlsx?month=${month}`} className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Download Excel
          </a>
        </form>

        {!u.hasRates ? (
          <Card className="p-5">
            <p className="text-sm text-slate-600">
              No exchange rates entered yet.{" "}
              {user.role === "HEAD" && (
                <Link href="/admin/exchange-rate" className="font-medium text-indigo-600">
                  Enter the monthly rates
                </Link>
              )}{" "}
              to see sales in USD.
            </p>
          </Card>
        ) : (
          <>
            {u.provisional.length > 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                No rate entered for {monthRanges(u.provisional)} - shown at the nearest month&apos;s rate, so these figures are provisional.{" "}
                {user.role === "HEAD" && (
                  <Link href="/admin/exchange-rate" className="font-medium underline">
                    Enter the rate
                  </Link>
                )}
              </p>
            )}

            <Card className="p-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {tile(
                  `Sales, ${u.monthLabel}`,
                  formatUsdCompact(c.sales),
                  <span className={achTone(pct(c.sales, c.target))}>
                    {pctText(pct(c.sales, c.target))} of {formatUsdCompact(c.target)} target
                  </span>,
                )}
                {tile(
                  "vs same month last year",
                  growthText(growth(c.sales, c.lySales)),
                  <>
                    last year {formatUsdCompact(c.lySales)}
                    {c.lyTarget > 0 && ` (${pctText(pct(c.lySales, c.lyTarget))} of target)`}
                  </>,
                )}
                {tile(
                  `Year to date (Jan-${c.label.split(" ")[0]})`,
                  formatUsdCompact(u.ytd.sales),
                  <span className={achTone(pct(u.ytd.sales, u.ytd.target))}>
                    {pctText(pct(u.ytd.sales, u.ytd.target))} of {formatUsdCompact(u.ytd.target)} target
                  </span>,
                )}
                {tile(
                  `YTD vs ${y - 1}`,
                  growthText(growth(u.ytd.sales, u.ytd.lySales)),
                  <>
                    {y - 1} same period {formatUsdCompact(u.ytd.lySales)}
                    {u.ytd.lyTarget > 0 && ` (${pctText(pct(u.ytd.lySales, u.ytd.lyTarget))} of target)`}
                  </>,
                )}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {u.monthLabel} at ₦{c.rate ? formatNumber(c.rate) : "—"} to the dollar{c.provisional ? " (provisional)" : ""}; same month last year at ₦{c.lyRate ? formatNumber(c.lyRate) : "—"}. Sales = won deals + project billing, excl. VAT, sales team only.
              </p>
            </Card>

            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Last 12 months in USD</h2>
              <div className="grid grid-cols-1 items-center gap-5 xl:grid-cols-5">
                <div className="xl:col-span-3">
                  <TargetTrendChart currency="USD" data={u.trend.map((r) => ({ month: r.label, target: r.target, actual: r.sales, lastYear: r.lySales, lastYearTarget: r.lyTarget }))} />
                </div>
                <div className="overflow-x-auto xl:col-span-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-left">
                        <th className={th}>Month</th>
                        <th className={`${th} text-right`}>₦/$</th>
                        <th className={`${th} text-right`}>Target</th>
                        <th className={`${th} text-right`}>Sales</th>
                        <th className={`${th} text-right`}>Ach.</th>
                        <th className={`${th} text-right`}>Last yr</th>
                        <th className={`${th} text-right`}>vs LY</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {u.trend.map((r) => {
                        const a = pct(r.sales, r.target);
                        const g = growth(r.sales, r.lySales);
                        return (
                          <tr key={r.key}>
                            <td className="py-1.5 pr-3">{r.label}</td>
                            <td className={`${num} ${r.provisional ? "text-amber-600" : "text-slate-500"}`}>{r.rate ? formatNumber(r.rate) : "—"}</td>
                            <td className={num}>{formatUsdCompact(r.target)}</td>
                            <td className={num}>{formatUsdCompact(r.sales)}</td>
                            <td className={`${num} font-medium ${achTone(a)}`}>{pctText(a)}</td>
                            <td className={`${num} text-slate-500`}>{formatUsdCompact(r.lySales)}</td>
                            <td className={`${num} ${growthTone(g)}`}>{growthText(g)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Each sales person</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className={th} />
                      <th className={`${th} text-center`} colSpan={5}>
                        {u.monthLabel}
                      </th>
                      <th className={`${th} text-center`} colSpan={5}>
                        Year to date
                      </th>
                    </tr>
                    <tr className="border-b border-slate-200 text-left">
                      <th className={th}>Sales person</th>
                      {[0, 1].flatMap((i) =>
                        ["Target", "Sales", "Ach.", "Last yr", "vs LY"].map((h) => (
                          <th key={`${h}${i}`} className={`${th} text-right`}>
                            {h}
                          </th>
                        )),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {u.people.map((p) => {
                      const cells = (t: number, s: number, l: number) => {
                        const a = pct(s, t);
                        const g = growth(s, l);
                        return (
                          <>
                            <td className={num}>{formatUsdCompact(t)}</td>
                            <td className={num}>{formatUsdCompact(s)}</td>
                            <td className={`${num} font-medium ${achTone(a)}`}>{pctText(a)}</td>
                            <td className={`${num} text-slate-500`}>{formatUsdCompact(l)}</td>
                            <td className={`${num} ${growthTone(g)}`}>{growthText(g)}</td>
                          </>
                        );
                      };
                      return (
                        <tr key={p.id}>
                          <td className="py-1.5 pr-3 text-slate-800">{p.name}</td>
                          {cells(p.target, p.sales, p.ly)}
                          {cells(p.ytdTarget, p.ytdSales, p.ytdLy)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">By product category</h2>
              {u.categories.length === 0 ? (
                <p className="text-sm text-slate-500">No sales in these periods.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className={th} />
                        <th className={`${th} text-center`} colSpan={3}>
                          {u.monthLabel} vs {y - 1}
                        </th>
                        <th className={`${th} text-center`} colSpan={4}>
                          Year to date vs {y - 1}
                        </th>
                      </tr>
                      <tr className="border-b border-slate-200 text-left">
                        <th className={th}>Category</th>
                        <th className={`${th} text-right`}>{y}</th>
                        <th className={`${th} text-right`}>{y - 1}</th>
                        <th className={`${th} text-right`}>Change</th>
                        <th className={`${th} text-right`}>{y}</th>
                        <th className={`${th} text-right`}>{y - 1}</th>
                        <th className={`${th} text-right`}>Change</th>
                        <th className={`${th} text-right`}>Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...u.categories, { category: "Total", ...totals }].map((x) => {
                        const gm = growth(x.month, x.monthLy);
                        const gy = growth(x.ytd, x.ytdLy);
                        const total = x.category === "Total";
                        return (
                          <tr key={x.category} className={total ? "border-t-2 border-slate-300 font-semibold" : ""}>
                            <td className="py-1.5 pr-3 text-slate-800">{x.category}</td>
                            <td className={num}>{formatUsdCompact(x.month)}</td>
                            <td className={`${num} text-slate-500`}>{formatUsdCompact(x.monthLy)}</td>
                            <td className={`${num} ${growthTone(gm)}`}>{x.monthLy > 0 ? growthText(gm) : x.month > 0 ? "new" : "—"}</td>
                            <td className={num}>{formatUsdCompact(x.ytd)}</td>
                            <td className={`${num} text-slate-500`}>{formatUsdCompact(x.ytdLy)}</td>
                            <td className={`${num} ${growthTone(gy)}`}>{x.ytdLy > 0 ? growthText(gy) : x.ytd > 0 ? "new" : "—"}</td>
                            <td className={`${num} text-slate-500`}>{pctText(pct(x.ytd, totals.ytd))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-slate-500">
                    Categories come from invoiced product lines (Sales Register), plus project / service billing and won deals with no products listed - so the total can differ a little from sales above.
                  </p>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
