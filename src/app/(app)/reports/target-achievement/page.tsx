import Link from "next/link";
import { requireBackOffice } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { formatCurrency, formatCompactCurrency } from "@/lib/format";
import { getTargetAchievement, rangeFrom, periodLabel, achievementPct, type TARow } from "@/lib/target-achievement";
import { ComboChart, type ComboSeries } from "@/components/combo-chart";
import { FileDown, FileSpreadsheet } from "lucide-react";

// Target vs achievement and % achievement per sales person for a range of
// months, with the month-by-month detail - downloadable as PDF and Excel.

const monthInput = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const pctTxt = (p: number | null) => (p == null ? "-" : `${p.toFixed(1)}%`);
const tone = (p: number | null) => (p == null ? "text-slate-400" : p >= 100 ? "text-emerald-700" : p >= 70 ? "text-amber-700" : "text-rose-700");
const barTone = (p: number | null) => (p == null ? "bg-slate-200" : p >= 100 ? "bg-emerald-500" : p >= 70 ? "bg-amber-400" : "bg-rose-400");

const td = "px-3 py-1.5 text-right tabular-nums whitespace-nowrap";

function Row({ x, team = false }: { x: TARow; team?: boolean }) {
  const gap = x.achieved - x.target;
  return (
    <tr className={team ? "border-t-2 border-slate-300 bg-indigo-50 font-semibold text-indigo-950" : "border-t border-slate-100"}>
      <td className="px-3 py-1.5 whitespace-nowrap font-medium">{x.name}</td>
      <td className={td}>{x.target ? formatCurrency(x.target) : "-"}</td>
      <td className={td}>{formatCurrency(x.achieved)}</td>
      <td className={`${td} ${!x.target ? "text-slate-400" : gap >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{x.target ? `${gap >= 0 ? "+" : ""}${formatCurrency(gap)}` : "-"}</td>
      <td className="px-3 py-1.5 w-56">
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-slate-100">
            {x.pct != null && <div className={`h-2 rounded-full ${barTone(x.pct)} transition-all duration-700`} style={{ width: `${Math.min(100, Math.max(2, x.pct))}%` }} />}
          </div>
          <span className={`w-16 text-right text-sm font-bold tabular-nums ${tone(x.pct)}`}>{pctTxt(x.pct)}</span>
        </div>
      </td>
    </tr>
  );
}

export default async function TargetAchievementPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireBackOffice();
  const params = await searchParams;
  const { from, to, months } = rangeFrom(params);
  const r = await getTargetAchievement(from, to, months);
  const qs = `from=${monthInput(from)}&to=${monthInput(to)}`;
  const chartData = r.rows.map((x) => ({ label: x.name.split(" ")[0], achieved: x.achieved, target: x.target || null }));
  const series: ComboSeries[] = [
    { key: "achieved", name: "Achieved", color: "#10b981", type: "bar" },
    { key: "target", name: "Target", color: "#4f46e5", type: "line", dashed: true },
  ];
  return (
    <div>
      <PageHeader
        title="Target vs Achievement"
        description={`${r.rows.length} sales people · ${periodLabel(r)} · achieved = won deals (by invoice date) + project billing, excl. VAT`}
        action={
          <div className="flex flex-wrap items-end gap-2">
            <form action="/reports/target-achievement" className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-500">
                From
                <input type="month" name="from" defaultValue={monthInput(from)} className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs text-slate-500">
                To
                <input type="month" name="to" defaultValue={monthInput(to)} className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" />
              </label>
              <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white">
                Show
              </button>
            </form>
            <a href={`/reports/target-achievement/pdf?${qs}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <FileDown className="h-4 w-4 text-rose-600" />
              PDF
            </a>
            <a href={`/reports/target-achievement/xlsx?${qs}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Excel
            </a>
          </div>
        }
      />
      <div className="p-6 space-y-5">
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Summary - {periodLabel(r)}</h2>
          <p className="mb-3 text-xs text-slate-500">Green = target met, amber = 70% or more, red = under 70%.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Sales person</th>
                  <th className="px-3 py-2 text-right font-medium">Target</th>
                  <th className="px-3 py-2 text-right font-medium">Achieved</th>
                  <th className="px-3 py-2 text-right font-medium">Shortfall / excess</th>
                  <th className="px-3 py-2 text-right font-medium">% Achieved</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((x) => (
                  <Row key={x.id} x={x} />
                ))}
              </tbody>
              <tfoot>
                <Row x={r.team} team />
              </tfoot>
            </table>
          </div>
          {r.rows.length > 0 && (
            <div className="mt-4">
              <ComboChart data={chartData} series={series} height={240} />
            </div>
          )}
        </Card>

        {r.months.length > 1 && (
          <Card className="p-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Month by month</h2>
            <p className="mb-3 text-xs text-slate-500">Each cell: achieved / target, and % achieved.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-own-head>
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide">
                    <th className="px-2 py-1.5 text-left font-medium bg-slate-100 text-slate-600">Sales person</th>
                    {r.months.map((m) => (
                      <th key={m.toISOString()} className="px-2 py-1.5 text-right font-medium bg-indigo-50 text-indigo-800">
                        {m.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-right font-medium bg-indigo-100 text-indigo-900">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...r.rows, r.team].map((x) => (
                    <tr key={x.id} className={x.id === "team" ? "border-t-2 border-slate-300 bg-indigo-50/60 font-semibold" : "border-t border-slate-100"}>
                      <td className="px-2 py-1.5 whitespace-nowrap font-medium text-slate-800">{x.name}</td>
                      {x.months.map((c, i) => {
                        const p = achievementPct(c.achieved, c.target);
                        return (
                          <td key={i} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                            <div className="text-slate-800">
                              {c.achieved ? formatCompactCurrency(c.achieved) : "-"}
                              <span className="text-slate-400"> / {c.target ? formatCompactCurrency(c.target) : "-"}</span>
                            </div>
                            <div className={`text-[10px] font-bold ${tone(p)}`}>{pctTxt(p)}</div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap bg-indigo-50/40">
                        <div className="font-semibold">
                          {formatCompactCurrency(x.achieved)}
                          <span className="font-normal text-slate-400"> / {x.target ? formatCompactCurrency(x.target) : "-"}</span>
                        </div>
                        <div className={`text-[10px] font-bold ${tone(x.pct)}`}>{pctTxt(x.pct)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        <p className="text-xs text-slate-500">
          Targets are set on the{" "}
          <Link href="/targets" className="text-indigo-600 hover:text-indigo-700">
            Targets
          </Link>{" "}
          page or by upload.
        </p>
      </div>
    </div>
  );
}
