import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatCompactCurrency } from "@/lib/format";
import { ExportCsvButton } from "@/components/export-csv-button";
import { calculateSalesIncentive, distributeSupportPool, getIncentiveSettings, type IncentiveSettings } from "@/lib/incentive";

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
const ratePct = (r: number) => (r > 0 ? `${Number((r * 100).toFixed(3))}%` : "Not eligible");
// Whole naira in the table so every column fits; the CSV keeps kobo.
const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

function schemeText(settings: IncentiveSettings) {
  const tiers = [...settings.tiers].sort((a, b) => b.minAchievementPct - a.minAchievementPct);
  return {
    tiers: tiers.map((t) => `${t.minAchievementPct}% or more earns ${t.ratePct}%`).join("; "),
    lowest: tiers[tiers.length - 1]?.minAchievementPct ?? 0,
  };
}

export default async function IncentivesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const isHead = user.role === "HEAD";
  const month = parseMonth((await searchParams).month);
  const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const inProgress = nextMonth > new Date();

  // The whole team is always calculated - the support pool depends on
  // everyone's figures - but each person is only shown their own amount.
  const [settings, reps] = await Promise.all([
    getIncentiveSettings(),
    prisma.user.findMany({ where: { isActive: true, title: "Sales Manager" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const repIds = reps.map((r) => r.id);
  const [targets, sales, projects] = await Promise.all([
    prisma.target.findMany({ where: { userId: { in: repIds }, month }, select: { userId: true, targetValue: true } }),
    prisma.deal.groupBy({
      by: ["ownerId"],
      where: { ownerId: { in: repIds }, stage: "WON", closedAt: { gte: month, lt: nextMonth } },
      _sum: { value: true },
    }),
    // Project & Service billing counts toward incentive too.
    prisma.projectBilling.groupBy({
      by: ["ownerId"],
      where: { ownerId: { in: repIds }, month },
      _sum: { value: true },
    }),
  ]);
  const projectBy = new Map(projects.map((p) => [p.ownerId, p._sum.value ?? 0]));
  const targetBy = new Map(targets.map((t) => [t.userId, t.targetValue]));
  const salesBy = new Map(sales.map((s) => [s.ownerId, s._sum.value ?? 0]));
  const rows = reps.map((r) =>
    calculateSalesIncentive(
      {
        userId: r.id,
        name: r.name,
        target: targetBy.get(r.id) ?? 0,
        productSales: salesBy.get(r.id) ?? 0,
        projectSales: projectBy.get(r.id) ?? 0,
      },
      settings,
    ),
  );
  const pool = rows.reduce((s, r) => s + r.toPool, 0);
  const support = distributeSupportPool(pool, settings);
  const scheme = schemeText(settings);

  const monthPicker = (
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
  );
  const period = `${monthLabel(month)}${inProgress ? " (month still running - provisional)" : ""}`;

  // Nothing is calculated before the scheme's start month.
  const [sy, sm] = settings.startMonth.split("-").map(Number);
  const startMonth = new Date(Date.UTC(sy, sm - 1, 1));
  // Earlier months of the start year can be worked out for the Head's
  // reference only; everyone else, and earlier years, see nothing.
  const referenceOnly = isHead && month < startMonth && month.getUTCFullYear() === startMonth.getUTCFullYear();
  if (month < startMonth && !referenceOnly) {
    return (
      <div>
        <PageHeader title={isHead ? "Incentives" : "My Incentive"} description={monthLabel(month)} />
        <div className="p-6 space-y-4">
          {monthPicker}
          <Card className="p-6">
            <EmptyState
              title={`Incentives start from ${monthLabel(startMonth)}`}
              description="Pick that month or a later one to see the calculation."
            />
          </Card>
        </div>
      </div>
    );
  }

  // ---- Sales manager / support staff: only their own money ----
  if (!isHead) {
    const mine = rows.find((r) => r.userId === user.id);
    const myShare = support.find((s) => s.userId === user.id);
    return (
      <div>
        <PageHeader title="My Incentive" description={period} />
        <div className="p-6 space-y-4">
          {monthPicker}
          {!mine && !myShare && (
            <Card className="p-6">
              <EmptyState title="You're not on the incentive scheme" description="Ask the Head of Sales if you think this is wrong." />
            </Card>
          )}
          {mine && (
            <Card className="p-6">
              <p className="text-sm text-slate-500">Your incentive for {monthLabel(month)}</p>
              <p className={`text-3xl font-semibold mt-1 ${mine.totalToReceive > 0 ? "text-emerald-700" : "text-slate-900"}`}>
                {formatCurrency(mine.totalToReceive)}
              </p>
              {mine.salarySupport > 0 && (
                <p className="text-sm text-slate-600 mt-1">
                  {formatCurrency(mine.payout)} incentive + {formatCurrency(mine.salarySupport)} salary support
                </p>
              )}
              <p className="text-sm mt-2 text-slate-600">
                {mine.target <= 0
                  ? "No target was set for you this month, so no incentive applies."
                  : mine.totalToReceive > 0
                    ? `You achieved ${pct(mine.achievement)} of your target.`
                    : `You achieved ${pct(mine.achievement)} of your target - ${scheme.lowest}% is needed to qualify.`}
              </p>
              <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-slate-500">Target</dt>
                  <dd className="font-medium text-slate-800">{mine.target > 0 ? formatCurrency(mine.target) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Your sales</dt>
                  <dd className="font-medium text-slate-800">{formatCurrency(mine.sales)}</dd>
                  {mine.projectSales !== 0 && (
                    <dd className="text-xs text-slate-500">
                      {formatCurrency(mine.productSales)} products + {formatCurrency(mine.projectSales)} projects
                    </dd>
                  )}
                </div>
                <div>
                  <dt className="text-slate-500">Achievement</dt>
                  <dd className="font-medium text-slate-800">{pct(mine.achievement)}</dd>
                </div>
              </dl>
            </Card>
          )}
          {myShare && (
            <Card className="p-6">
              <p className="text-sm text-slate-500">
                Your support staff share for {monthLabel(month)} ({myShare.role})
              </p>
              <p className={`text-3xl font-semibold mt-1 ${myShare.amount > 0 ? "text-emerald-700" : "text-slate-900"}`}>{formatCurrency(myShare.amount)}</p>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // ---- Head: the full calculation for every employee ----
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalIncentive = rows.reduce((s, r) => s + r.incentive, 0);
  const totalPayout = rows.reduce((s, r) => s + r.payout, 0);
  const totalSalarySupport = rows.reduce((s, r) => s + r.salarySupport, 0);
  const totalSupport = support.reduce((s, r) => s + r.amount, 0);
  const eligible = rows.filter((r) => r.rate > 0).length;
  const keepPct = settings.salesPersonSharePct;
  const coordinator = support.find((s) => s.coordinator);
  const csvRows: (string | number)[][] = [
    ...rows.map((r) => [
      "Sales",
      r.name,
      Math.round(r.target),
      Math.round(r.productSales),
      Math.round(r.projectSales),
      Math.round(r.sales),
      r.achievement == null ? "" : Math.round(r.achievement * 1000) / 10,
      Math.round(r.rate * 100000) / 1000,
      Math.round(r.incentive * 100) / 100,
      Math.round(r.payout * 100) / 100,
      Math.round(r.toPool * 100) / 100,
      Math.round(r.salarySupport * 100) / 100,
      Math.round(r.totalToReceive * 100) / 100,
    ]),
    ...support.map((s) => ["Support", `${s.name} (${s.role})`, "", "", "", "", "", "", "", "", "", "", Math.round(s.amount * 100) / 100]),
  ];

  return (
    <div>
      <PageHeader
        title="Incentives"
        description={`Monthly incentive for every employee - ${period}${referenceOnly ? " (reference only)" : ""}`}
        action={
          <Link href="/incentives/settings" className="text-sm text-indigo-600 hover:text-indigo-700">
            Scheme settings →
          </Link>
        }
      />
      <div className="p-6 space-y-4">
        {monthPicker}

        {referenceOnly && (
          <Card className="p-4 border-amber-200 bg-amber-50 text-sm text-amber-800">
            For reference only - the scheme starts from {monthLabel(startMonth)}. {monthLabel(month)} is worked out with
            the current scheme settings, is visible only to you, and isn&apos;t payable.
          </Card>
        )}

        <Card className="p-4 text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-800">How it&apos;s calculated: </span>
          achievement = the month&apos;s sales (Won product sales + Project &amp; Service billing) ÷ target. {scheme.tiers} of the month&apos;s sales; below {scheme.lowest}% (or no
          target) isn&apos;t eligible. Each eligible sales person keeps {keepPct}% and shares {100 - keepPct}% with support staff
          {coordinator
            ? `: ${coordinator.name} (${coordinator.role}) gets the first ${formatCurrency(settings.coordinatorFirstShare)}, and the balance is split equally among the others.`
            : ", split equally."}{" "}
          {settings.salarySupport.length > 0 &&
            `Salary support: ${settings.salarySupport.map((s) => `${s.name} gets ${s.pct}% of their incentive extra`).join("; ")}, on top of their share and not from the pool. `}
          Sales managers and linked support staff see only their own amount.
        </Card>

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
            <p className="text-sm text-slate-500">Paid to sales people</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCurrency(totalPayout + totalSalarySupport)}</p>
            <p className="text-xs text-slate-400 mt-1">
              {keepPct}% share {formatCurrency(totalPayout)}
              {totalSalarySupport > 0 && ` + salary support ${formatCurrency(totalSalarySupport)}`}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-slate-500">Paid to support staff ({100 - keepPct}%)</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCurrency(totalSupport)}</p>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between p-4 pb-0">
            <h2 className="text-sm font-semibold text-slate-900">Sales team</h2>
            <ExportCsvButton
              filename={`incentives-${monthValue(month)}.csv`}
              headers={["Type", "Name", "Target", "Product sales", "Project billing", "Sales", "Achievement %", "Rate %", "Incentive", "Payout", "To support pool", "Salary support", "Total to receive"]}
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
                    <th className="px-2.5 py-3 font-medium text-right">Sales / target</th>
                    <th className="px-2.5 py-3 font-medium text-right">Achievement / rate</th>
                    <th className="px-2.5 py-3 font-medium text-right">Incentive</th>
                    <th className="px-2.5 py-3 font-medium text-right" title={`${100 - keepPct}% of the incentive goes to the support staff pool`}>
                      Share ({keepPct}%)
                    </th>
                    <th className="px-2.5 py-3 font-medium text-right">Salary support</th>
                    <th className="px-4 py-3 font-medium text-right">To receive</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.userId}>
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-normal min-w-[150px]">
                        <Link
                          href={`/reports/sales-breakdown?rep=${r.userId}&month=${monthValue(month)}`}
                          className="hover:text-indigo-600"
                          title="See every line behind this figure"
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-2.5 py-3 text-right tabular-nums text-slate-700" title={formatCurrency(r.sales)}>
                        {formatCompactCurrency(r.sales)}
                        {r.projectSales !== 0 && (
                          <div className="text-[11px] text-indigo-600">incl. {formatCompactCurrency(r.projectSales)} projects</div>
                        )}
                        <div className="text-[11px] text-slate-400">
                          {r.target > 0 ? `of ${formatCompactCurrency(r.target)}` : "No target"}
                        </div>
                      </td>
                      <td
                        className={`px-2.5 py-3 text-right tabular-nums font-medium ${
                          r.achievement == null ? "text-slate-400" : r.rate > 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {pct(r.achievement)}
                        <div className={`text-[11px] font-normal ${r.rate > 0 ? "text-slate-500" : "text-slate-400"}`}>{ratePct(r.rate)}</div>
                      </td>
                      <td className="px-2.5 py-3 text-right tabular-nums text-slate-700">{naira(r.incentive)}</td>
                      <td className="px-2.5 py-3 text-right tabular-nums text-slate-700">
                        {naira(r.payout)}
                        {r.toPool > 0 && <div className="text-[11px] text-slate-400">{naira(r.toPool)} to support</div>}
                      </td>
                      <td className="px-2.5 py-3 text-right tabular-nums text-slate-700">
                        {r.salarySupportPct > 0 ? (
                          <>
                            {naira(r.salarySupport)}
                            <div className="text-[11px] text-slate-400">{r.salarySupportPct}% of incentive</div>
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{naira(r.totalToReceive)}</td>
                    </tr>
                  ))}
                </tbody>
                {rows.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-2.5 py-3 text-right tabular-nums">{formatCompactCurrency(totalSales)}</td>
                      <td className="px-2.5 py-3" />
                      <td className="px-2.5 py-3 text-right tabular-nums">{naira(totalIncentive)}</td>
                      <td className="px-2.5 py-3 text-right tabular-nums">
                        {naira(totalPayout)}
                        <div className="text-[11px] font-normal text-slate-500">{naira(pool)} to support</div>
                      </td>
                      <td className="px-2.5 py-3 text-right tabular-nums">{naira(totalSalarySupport)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{naira(totalPayout + totalSalarySupport)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>

        <Card>
          <div className="p-4 pb-0">
            <h2 className="text-sm font-semibold text-slate-900">Support staff share</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pool of {formatCurrency(pool)}
              {coordinator
                ? pool > settings.coordinatorFirstShare
                  ? `: ${coordinator.name} takes the first ${formatCurrency(settings.coordinatorFirstShare)}, and the remaining ${formatCurrency(pool - settings.coordinatorFirstShare)} is split equally among the others.`
                  : pool > 0
                    ? `: below ${formatCurrency(settings.coordinatorFirstShare)}, so it all goes to ${coordinator.name} this month.`
                    : " - no one was eligible this month, so there's nothing to share."
                : ", split equally."}
            </p>
          </div>
          {support.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No support staff set up" description="Add them in Scheme settings." />
            </div>
          ) : (
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
                  {support.map((s, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                      <td className="px-4 py-3 text-slate-600">{s.role}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{formatCurrency(s.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
