import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { formatCurrency, formatCompactCurrency } from "@/lib/format";
import { TargetChart } from "./target-chart";
import { SetTargetForm } from "./set-target-form";
import { ExportCsvButton } from "@/components/export-csv-button";

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
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const month = parseMonthParam(params.month);
  const monthStr = monthValue(month);
  const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));

  const reps =
    user.role === "HEAD"
      ? await prisma.user.findMany({
          where: { isActive: true, title: "Sales Manager" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [{ id: user.id, name: user.name ?? "Me" }];

  const repIds = reps.map((r) => r.id);

  const [targets, wonDeals] = await Promise.all([
    prisma.target.findMany({ where: { userId: { in: repIds }, month } }),
    prisma.deal.findMany({
      where: { ownerId: { in: repIds }, stage: "WON", closedAt: { gte: month, lt: nextMonth } },
      select: { ownerId: true, value: true },
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

  return (
    <div>
      <PageHeader
        title="Targets"
        description={`Target vs. actual sales for ${monthLabel(month)}`}
        action={
          user.role === "HEAD" ? (
            <Link href="/admin/import/targets" className="text-sm text-indigo-600 hover:text-indigo-700">
              Bulk upload targets →
            </Link>
          ) : undefined
        }
      />
      <div className="p-6 space-y-4">
        <form className="flex items-center gap-3" action="/targets">
          <label className="text-sm text-slate-500">Month</label>
          <input
            type="month"
            name="month"
            defaultValue={monthStr}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
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
          <Card className="p-4">
            <p className="text-sm text-slate-500">Achievement</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {totalTarget > 0 ? `${Math.round((totalActual / totalTarget) * 100)}%` : "—"}
            </p>
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Target vs. Actual, per sales rep</h2>
          <TargetChart data={rows} />
        </Card>

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
                      <td className="px-4 py-3 text-slate-600">{formatCurrency(actual)}</td>
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
            <SetTargetForm reps={reps} month={monthStr} />
          </Card>
        )}
      </div>
    </div>
  );
}
