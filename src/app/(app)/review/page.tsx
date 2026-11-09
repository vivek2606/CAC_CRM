import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, isBackOffice } from "@/lib/rbac";
import { blockServiceManager } from "@/lib/service-access";
import { PageHeader, Card } from "@/components/ui";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { SALES_TITLE_IN } from "@/lib/team-titles";
import { getReviewPack } from "@/lib/review-pack";
import { reviewScope } from "./access";
import { PrintButton } from "./print-button";

// The monthly review pack: print it (or save as PDF from the print dialog)
// or download it in Excel.

const pct = (p: number | null) => (p == null ? "-" : `${p}%`);
const signed = (p: number | null) => (p == null ? "-" : `${p >= 0 ? "+" : ""}${p}%`);

export default async function ReviewPackPage({ searchParams }: { searchParams: Promise<{ month?: string; rep?: string }> }) {
  await blockServiceManager();
  const user = await requireUser();
  const sp = await searchParams;
  const { month, repId } = await reviewScope(user, sp);
  const p = await getReviewPack(month, repId);
  const reps = isBackOffice(user) ? await prisma.user.findMany({ where: { isActive: true, title: SALES_TITLE_IN }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  const who = p.scope.kind === "division" ? "Division" : p.scope.name;
  const th = "py-1.5 pr-3 text-xs font-medium uppercase tracking-wide text-slate-400";
  const td = "py-1.5 pr-3";
  const tile = (label: string, value: string, sub?: string) => (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );

  return (
    <div>
      <div className="print:hidden">
        <PageHeader title="Monthly review" description={`${who} - ${p.monthLabel}`} />
      </div>
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 print:max-w-none print:p-0">
        <form action="/review" className="flex flex-wrap items-end gap-3 print:hidden">
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">Month</span>
            <input type="month" name="month" defaultValue={month} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          </label>
          {reps.length > 0 && (
            <label className="text-xs font-medium text-slate-500">
              <span className="mb-1 block">For</span>
              <select name="rep" defaultValue={repId ?? ""} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="">Whole division</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Show
          </button>
          <span className="ml-auto flex gap-2">
            <PrintButton />
            <a href={`/review/xlsx?month=${month}${repId ? `&rep=${repId}` : ""}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Download Excel
            </a>
          </span>
        </form>

        <h1 className="hidden text-lg font-semibold print:block">
          Monthly review - {who} - {p.monthLabel}
        </h1>

        <Card className="p-5 print:border-0 print:shadow-none">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Sales vs target</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tile("Achieved", formatCompactCurrency(p.summary.achieved), `${pct(p.summary.pct)} of ${formatCompactCurrency(p.summary.target)} target`)}
            {tile("Year to date", pct(p.summary.ytdPct), `${formatCompactCurrency(p.summary.ytdAchieved)} of ${formatCompactCurrency(p.summary.ytdTarget)}`)}
            {tile("vs same month last year", signed(p.summary.vsLastYearPct), `last year ${formatCompactCurrency(p.summary.lastYear)}`)}
            {tile("Forecast accuracy", p.forecast ? pct(p.forecast.pct) : "-", p.forecast ? `won ${formatCompactCurrency(p.forecast.won)} of ${formatCompactCurrency(p.forecast.forecast)} forecast` : "no forecast saved for this month")}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Lead funnel (leads created this month): {p.funnel.leads} leads → {p.funnel.deals} deals → {p.funnel.quoted} quoted → {p.funnel.won} won.
          </p>
        </Card>

        <Card className="p-5 print:border-0 print:shadow-none">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">{p.scope.kind === "division" ? "Each sales person" : "Figures"}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className={th}>Sales person</th>
                  <th className={`${th} text-right`}>Target</th>
                  <th className={`${th} text-right`}>Achieved</th>
                  <th className={`${th} text-right`}>%</th>
                  <th className={`${th} text-right`}>Won</th>
                  <th className={`${th} text-right`}>Win rate</th>
                  <th className={`${th} text-right`}>New leads</th>
                  <th className={`${th} text-right`}>Calls</th>
                  <th className={`${th} text-right`}>Visits</th>
                  <th className={`${th} text-right`}>Quotes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {p.people.map((r) => (
                  <tr key={r.id}>
                    <td className={`${td} text-slate-800`}>{r.name}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatCompactCurrency(r.target)}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatCompactCurrency(r.achieved)}</td>
                    <td className={`${td} text-right tabular-nums font-medium`}>{pct(r.target ? Math.round((r.achieved / r.target) * 100) : null)}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.wonCount}</td>
                    <td className={`${td} text-right tabular-nums`}>{pct(r.winRate)}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.newLeads}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.calls}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.visits}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.quotes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card className="p-5 print:border-0 print:shadow-none">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">
              Won ({p.won.length}, {formatCompactCurrency(p.won.reduce((s, d) => s + d.value, 0))})
            </h2>
            {p.won.length === 0 ? (
              <p className="text-sm text-slate-500">None this month.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {p.won.slice(0, 15).map((d, i) => (
                  <li key={i} className="flex gap-2 py-1">
                    <span className="flex-1 text-slate-800">
                      {d.customer || d.title}
                      {p.scope.kind === "division" && <span className="text-xs text-slate-400"> · {d.owner}</span>}
                    </span>
                    <span className="tabular-nums">{formatCurrency(d.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5 print:border-0 print:shadow-none">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">
              Lost ({p.lost.length}, {formatCompactCurrency(p.lost.reduce((s, d) => s + d.value, 0))})
            </h2>
            {p.lost.length === 0 ? (
              <p className="text-sm text-slate-500">None this month.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {p.lost.slice(0, 15).map((d, i) => (
                  <li key={i} className="py-1">
                    <div className="flex gap-2">
                      <span className="flex-1 text-slate-800">{d.customer || d.title}</span>
                      <span className="tabular-nums">{formatCurrency(d.value)}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {d.reason}
                      {d.brand && ` · to ${d.brand}`}
                      {d.gapPct != null && ` · we were ${Math.abs(d.gapPct)}% ${d.gapPct >= 0 ? "higher" : "lower"}`}
                      {p.scope.kind === "division" && ` · ${d.owner}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {p.service && (
          <Card className="p-5 print:border-0 print:shadow-none">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Service</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {tile("Complaints", String(p.service.registered), `${p.service.resolved} resolved`)}
              {tile("Resolved within service level", pct(p.service.slaResolvePct))}
              {tile("First-time fix", pct(p.service.firstTimeFixPct))}
              {tile("Installations commissioned", String(p.service.installsCommissioned), `service billed ${formatCompactCurrency(p.service.billed)}`)}
            </div>
          </Card>
        )}
        <p className="text-xs text-slate-400 print:hidden">
          Figures as in{" "}
          <Link href="/incentives" className="text-indigo-600">
            Incentives & Targets
          </Link>{" "}
          (won deals plus project billing, excl. VAT). Print saves as PDF from the print dialog.
        </p>
      </div>
    </div>
  );
}
