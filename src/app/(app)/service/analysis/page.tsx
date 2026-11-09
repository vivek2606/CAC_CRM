import { requireService } from "@/lib/service-access";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { ExportCsvButton } from "@/components/export-csv-button";
import { formatCurrency } from "@/lib/format";
import { failureAnalysis } from "@/lib/failure-analysis";
import { ServiceTabs } from "../service-tabs";

// Failure rates by model and by spare part, for units sold in a period.

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);
const pct = (p: number | null) => (p == null ? "-" : p === 0 ? "0%" : `${p < 10 ? p.toFixed(1) : Math.round(p)}%`);
// Below this many units sold a rate says little.
const SMALL = 10;
const COHORT_MIN = 5;
// One hue, light to dark, by failure rate.
const heat = (p: number) =>
  p === 0 ? "bg-rose-50 text-rose-900" : p < 5 ? "bg-rose-100 text-rose-900" : p < 10 ? "bg-rose-200 text-rose-900" : p < 20 ? "bg-rose-400 text-white" : "bg-rose-600 text-white";

export default async function FailureAnalysisPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; cat?: string }> }) {
  await requireService();
  const sp = await searchParams;
  const now = new Date();
  const from = parse(sp.from) ?? new Date(Date.UTC(now.getUTCFullYear() - 2, 0, 1));
  const to = parse(sp.to) ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const a = await failureAnalysis(from, to);
  const categories = [...new Set(a.byModel.map((m) => m.category).filter((c): c is string => !!c))].sort();
  const models = sp.cat ? a.byModel.filter((m) => m.category === sp.cat) : a.byModel;
  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
  const worst = models.filter((m) => m.unitsSold >= SMALL && (m.ratePct ?? 0) > 0)[0];

  return (
    <div>
      <PageHeader title="Failure Analysis" description="Complaints on the units sold in a period, as a share of units sold - by model and by spare part (installation and routine servicing left out)" />
      <div className="p-6 space-y-5">
        <ServiceTabs active="analysis" />
        <form action="/service/analysis" className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">Units sold from</span>
            <input type="date" name="from" defaultValue={iso(from)} className={field} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">To</span>
            <input type="date" name="to" defaultValue={iso(to)} className={field} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">Product type</span>
            <select name="cat" defaultValue={sp.cat ?? ""} className={field}>
              <option value="">All types</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Show
          </button>
        </form>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Units sold" value={a.totals.unitsSold.toLocaleString()} sub={`${iso(from).split("-").reverse().join("/")} - ${iso(to).split("-").reverse().join("/")}`} accent="indigo" />
          <StatCard label="Failure rate" value={pct(a.totals.ratePct)} sub={`${a.totals.failures} complaints on them`} accent={(a.totals.ratePct ?? 0) > 5 ? "rose" : "emerald"} />
          <StatCard
            label="First-year failures"
            value={pct(a.totals.unitsSold ? (a.totals.firstYear / a.totals.unitsSold) * 100 : null)}
            sub={`${a.totals.firstYear} within 12 months of the invoice`}
            accent="amber"
          />
          <StatCard
            label="Highest rate (10+ sold)"
            value={worst ? pct(worst.ratePct) : "-"}
            sub={worst ? `${worst.model} · ${worst.failures} of ${worst.unitsSold}` : "Not enough sold yet"}
            accent="rose"
          />
        </div>

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">By model</h2>
            <span className="text-xs text-slate-500">Rates on fewer than {SMALL} units sold are in grey - too few to judge.</span>
            <span className="ml-auto" />
            <ExportCsvButton
              filename={`failure-by-model-${iso(from)}-${iso(to)}.csv`}
              headers={["Model", "Type", "Units sold", "Complaints", "Failure rate %", "First-year failures", "First-year rate %", "In warranty", "Avg days to failure", "Top faults", "Spares replaced", "Spares cost"]}
              rows={models.map((m) => [
                m.model,
                m.category ?? "",
                m.unitsSold,
                m.failures,
                m.ratePct == null ? "" : m.ratePct.toFixed(1),
                m.firstYear,
                m.firstYearRatePct == null ? "" : m.firstYearRatePct.toFixed(1),
                m.inWarranty,
                m.avgDaysToFailure ?? "",
                m.natures.slice(0, 3).map((n) => `${n.nature} (${n.count})`).join("; "),
                m.parts.slice(0, 5).map((p) => `${p.name} (${p.qty})`).join("; "),
                m.partsCost,
              ])}
            />
          </div>
          {models.length === 0 ? (
            <EmptyState title="No units sold in this period" description="Pick another period." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3 font-medium">Model</th>
                    <th className="py-2 pr-3 text-right font-medium">Sold</th>
                    <th className="py-2 pr-3 text-right font-medium">Complaints</th>
                    <th className="py-2 pr-3 text-right font-medium">Failure rate</th>
                    <th className="py-2 pr-3 text-right font-medium">1st year</th>
                    <th className="py-2 pr-3 text-right font-medium">Avg days to fail</th>
                    <th className="py-2 pr-3 font-medium">Top faults</th>
                    <th className="py-2 pr-3 font-medium">Spares replaced</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {models.map((m) => {
                    const small = m.unitsSold < SMALL;
                    const high = !small && (m.ratePct ?? 0) >= 5;
                    return (
                      <tr key={m.model} className="align-top">
                        <td className="py-2 pr-3 text-slate-800">
                          {m.model}
                          {m.category && <div className="text-xs text-slate-400">{m.category}</div>}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{m.unitsSold}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{m.failures}</td>
                        <td className={`py-2 pr-3 text-right tabular-nums font-semibold ${small ? "text-slate-400" : high ? "text-rose-600" : "text-slate-800"}`}>{pct(m.ratePct)}</td>
                        <td className={`py-2 pr-3 text-right tabular-nums ${small ? "text-slate-400" : ""}`}>{pct(m.firstYearRatePct)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{m.avgDaysToFailure ?? "-"}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600">{m.natures.slice(0, 3).map((n) => `${n.nature} (${n.count})`).join(", ") || "-"}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600">
                          {m.parts.slice(0, 4).map((p) => `${p.name} (${p.qty})`).join(", ") || "-"}
                          {m.partsCost > 0 && <div className="text-slate-400">{formatCurrency(m.partsCost)}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-slate-900">Failure rate by quarter of sale</h2>
          <p className="mb-3 text-xs text-slate-500">
            For the 12 models sold most: of the units sold in a quarter, how many have had a complaint. One quarter much darker than the rest points to a
            bad batch. Recent quarters have had less time to fail. Quarters with fewer than {COHORT_MIN} units are in grey.
          </p>
          {a.cohorts.length === 0 ? (
            <p className="text-sm text-slate-500">No units sold in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-1.5 pr-3 font-medium">Model</th>
                    {a.quarters.map((q) => (
                      <th key={q} className="px-1 py-1.5 text-center font-medium whitespace-nowrap">
                        {q}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.cohorts.slice(0, 12).map((m) => (
                    <tr key={m.model}>
                      <td className="py-1 pr-3 whitespace-nowrap text-slate-800">{m.model}</td>
                      {m.cells.map((c) => {
                        const small = c.unitsSold < COHORT_MIN;
                        return (
                          <td key={c.quarter} className="p-0.5">
                            <div
                              title={`${m.model}, sold ${c.quarter}: ${c.failures} complaint(s) on ${c.unitsSold} unit(s)`}
                              className={`min-w-[64px] rounded px-1.5 py-1 text-center text-xs tabular-nums ${c.unitsSold === 0 ? "text-slate-300" : small ? "bg-slate-50 text-slate-400" : heat(c.ratePct ?? 0)}`}
                            >
                              {c.unitsSold === 0 ? "-" : (
                                <>
                                  <div className="font-semibold">{pct(c.ratePct)}</div>
                                  <div className="text-[10px] opacity-80">
                                    {c.failures}/{c.unitsSold}
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-400">Shading: darker = higher failure rate (0%, under 5%, 5-10%, 10-20%, 20%+). Each cell: complaints / units sold.</p>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">By spare part</h2>
            <span className="ml-auto" />
            <ExportCsvButton
              filename={`failure-by-part-${iso(from)}-${iso(to)}.csv`}
              headers={["Spare part", "Replaced (qty)", "Complaints", "Free in warranty (qty)", "Models", "Cost"]}
              rows={a.byPart.map((p) => [p.name, p.qty, p.complaints, p.inWarrantyQty, p.models.map((m) => `${m.model} (${m.qty})`).join("; "), p.cost])}
            />
          </div>
          {a.byPart.length === 0 ? (
            <p className="text-sm text-slate-500">No spares replaced on these units yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3 font-medium">Spare part</th>
                  <th className="py-2 pr-3 text-right font-medium">Replaced</th>
                  <th className="py-2 pr-3 text-right font-medium">Complaints</th>
                  <th className="py-2 pr-3 text-right font-medium">Free in warranty</th>
                  <th className="py-2 pr-3 font-medium">Models</th>
                  <th className="py-2 pr-3 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {a.byPart.map((p) => (
                  <tr key={p.name}>
                    <td className="py-2 pr-3 text-slate-800">{p.name}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.qty}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.complaints}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.inWarrantyQty}</td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{p.models.slice(0, 4).map((m) => `${m.model} (${m.qty})`).join(", ")}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(p.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
