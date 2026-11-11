import Link from "next/link";
import { requireBackOffice } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { formatCompactCurrency } from "@/lib/format";
import { getStudioViews } from "@/lib/studio-views";
import { getSeasonality, MONTHS_SHORT, ORDER_LEAD_MONTHS, SEASON_YEARS, ALL, type Metric } from "@/lib/seasonality";
import { TeamTabs } from "../team-tabs";
import { SeasonChart, TargetSplitter } from "./season-ui";

// Seasonality guide: each category's share of the year by month (averaged
// over the last complete years), peak months and when to order stock for
// them, a year-on-year chart, and a yearly target split into months.

// Darker for months well above an even spread (8.3%), pale below.
function tone(share: number): string {
  const r = share / (100 / 12);
  if (r >= 1.6) return "bg-indigo-600 text-white";
  if (r >= 1.3) return "bg-indigo-400 text-white";
  if (r >= 1.1) return "bg-indigo-200 text-indigo-900";
  if (r >= 0.9) return "bg-indigo-50 text-slate-700";
  return "bg-white text-slate-400";
}

export default async function SeasonalityPage({ searchParams }: { searchParams: Promise<{ metric?: string; cat?: string }> }) {
  const user = await requireBackOffice();
  const sp = await searchParams;
  const metric: Metric = sp.metric === "units" ? "units" : "value";
  const [s, tabs] = await Promise.all([getSeasonality(metric), getStudioViews("team", user.id)]);
  const selected = s.rows.find((r) => r.category === sp.cat) ?? s.rows.find((r) => r.category === ALL) ?? s.rows[0];
  const units = metric === "units";
  const link = (o: { metric?: string; cat?: string }) => `/reports/seasonality?${new URLSearchParams({ metric: o.metric ?? metric, ...(o.cat ?? selected?.category ? { cat: o.cat ?? selected!.category } : {}) })}`;
  const th = "py-1.5 px-1 text-xs font-medium uppercase tracking-wide text-slate-400";
  const fmtYear = (v: number) => (units ? `${Math.round(v).toLocaleString("en-NG")} units` : formatCompactCurrency(v));
  const usedYears = s.complete.filter((y) => s.rows.some((r) => r.byYear[y].some((v) => v)));

  return (
    <div>
      <PageHeader title="Team Reports" description={`Seasonality - ${usedYears.length > 1 ? `${usedYears[0]}-${usedYears.at(-1)}` : usedYears.length ? usedYears[0] : `last ${SEASON_YEARS} years`}`} />
      <TeamTabs tabs={tabs} active="seasonality" />
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(["value", "units"] as const).map((m) => (
            <Link key={m} href={link({ metric: m })} className={`rounded-lg px-3 py-1.5 ${m === metric ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
              {m === "value" ? "By value" : "By units"}
            </Link>
          ))}
          <a href={`/reports/seasonality/xlsx?metric=${metric}`} className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50">
            Download Excel
          </a>
        </div>

        {s.rows.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm text-slate-500">No billing in the last {SEASON_YEARS} years yet.</p>
          </Card>
        ) : (
          <>
            <Card className="p-5">
              <h2 className="mb-1 text-sm font-semibold text-slate-900">Each month&apos;s share of the year</h2>
              <p className="mb-3 text-xs text-slate-500">
                Averaged over {usedYears.join(", ") || "the complete years"} - an even year would be 8.3% a month; darker is busier. Peak months are the busiest (well above 8.3%); order stock {ORDER_LEAD_MONTHS} months
                ahead of them (Midea lead time). Click a category for its chart.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0.5 text-xs">
                  <thead>
                    <tr className="text-left">
                      <th className={th}>Category</th>
                      {MONTHS_SHORT.map((m) => (
                        <th key={m} className={`${th} text-center`}>
                          {m}
                        </th>
                      ))}
                      <th className={`${th} text-right`}>Average year</th>
                      <th className={th}>Peak</th>
                      <th className={th}>Order by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((r) => (
                      <tr key={r.category} className={r.category === selected?.category ? "outline outline-2 outline-indigo-300" : ""}>
                        <td className={`px-1 py-1 whitespace-nowrap ${r.category === ALL ? "font-semibold" : ""}`}>
                          <Link href={link({ cat: r.category })} className="text-slate-800 hover:text-indigo-700">
                            {r.category}
                          </Link>
                        </td>
                        {r.share.map((v, m) => (
                          <td key={m} className={`rounded px-1 py-1 text-center tabular-nums ${r.yearly ? tone(v) : "text-slate-300"} ${r.peaks.includes(m) ? "font-bold" : ""}`}>
                            {r.yearly ? `${v.toFixed(0)}%` : "—"}
                          </td>
                        ))}
                        <td className="px-1 py-1 text-right tabular-nums text-slate-600">{r.yearly ? fmtYear(r.yearly) : "—"}</td>
                        <td className="px-1 py-1 whitespace-nowrap text-slate-700">{r.peaks.map((m) => MONTHS_SHORT[m]).join(", ") || "even"}</td>
                        <td className="px-1 py-1 whitespace-nowrap text-slate-700">{r.orderBy.map((m) => MONTHS_SHORT[m]).join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {selected && (
              <Card className="p-5">
                <h2 className="mb-2 text-sm font-semibold text-slate-900">
                  {selected.category} - month by month, {s.years[0]}-{s.thisYear}
                </h2>
                <SeasonChart byYear={selected.byYear} years={s.years} units={units} />
                <p className="mt-1 text-xs text-slate-500">{s.thisYear} is the year so far. If this year&apos;s line runs above the others in the same months, it&apos;s growth, not season.</p>
              </Card>
            )}

            {!units && (
              <Card className="p-5">
                <h2 className="mb-3 text-sm font-semibold text-slate-900">Split a yearly target into months</h2>
                <TargetSplitter patterns={s.rows.filter((r) => r.yearly > 0).map((r) => ({ category: r.category, share: r.share }))} />
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
