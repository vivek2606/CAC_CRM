import { formatCompactCurrency } from "@/lib/format";
import type { MonthlyPipeline, PipelineCell } from "@/lib/monthly-pipeline";
import { ComboChart, type ComboSeries } from "@/components/combo-chart";

const sum = (cells: PipelineCell[]): PipelineCell =>
  cells.reduce(
    (t, c) => ({
      open: t.open + c.open,
      openValue: t.openValue + c.openValue,
      converted: t.converted + c.converted,
      won: t.won + c.won,
      wonValue: t.wonValue + c.wonValue,
      wonCrm: t.wonCrm + c.wonCrm,
      lost: t.lost + c.lost,
    }),
    { open: 0, openValue: 0, converted: 0, won: 0, wonValue: 0, wonCrm: 0, lost: 0 },
  );

const monthLong = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

// The team, month by month: open at month end, converted, won, lost, win
// rate, average deal - with a bar for won value so the trend reads at a glance.
export function TeamMonthlyTrend({ data }: { data: MonthlyPipeline }) {
  const { months, people, cells } = data;
  const rows = months.map((m, i) => ({ m, c: sum(people.map((p) => cells.get(`${p.id}|${i}`)!)) }));
  const maxWon = Math.max(0, ...rows.map((r) => r.c.wonValue));
  const money = (v: number) => (v ? formatCompactCurrency(v) : "-");
  const num = (n: number) => (n ? String(n) : "-");
  const td = "px-3 py-1.5 text-right tabular-nums whitespace-nowrap";
  const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  const chartData = rows.map(({ m, c }) => ({ label: short(m), won: c.wonValue, open: c.openValue || null, wonDeals: c.won }));
  // Won value happens in a month (bars); open pipeline is a level carried
  // month to month (line); won deals is a count (right axis).
  const series: ComboSeries[] = [
    { key: "won", name: "Won value", color: "#10b981", type: "bar" },
    { key: "open", name: "Open pipeline (month end)", color: "#0ea5e9", type: "line" },
    { key: "wonDeals", name: "Won deals", color: "#f59e0b", type: "line", axis: "count", dashed: true },
  ];
  return (
    <div className="space-y-3">
    {rows.length > 1 && <ComboChart data={chartData} series={series} height={250} />}
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-own-head>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide">
            <th className="px-3 py-2 font-medium bg-slate-100 text-slate-600">Month</th>
            <th className="px-3 py-2 text-right font-medium bg-sky-100 text-sky-800" title="Still open at the month's end (this month: now)">Open at month end</th>
            <th className="px-3 py-2 text-right font-medium bg-violet-100 text-violet-800">Converted from lead</th>
            <th className="px-3 py-2 text-right font-medium bg-emerald-100 text-emerald-800">Won deals</th>
            <th className="px-3 py-2 font-medium bg-emerald-100 text-emerald-800 w-1/4">Won value</th>
            <th className="px-3 py-2 text-right font-medium bg-rose-100 text-rose-800">Lost</th>
            <th className="px-3 py-2 text-right font-medium bg-amber-100 text-amber-800" title="Won ÷ (won + lost), deals closed in the CRM">Win rate</th>
            <th className="px-3 py-2 text-right font-medium bg-slate-100 text-slate-600">Avg deal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ m, c }) => {
            const closed = c.wonCrm + c.lost;
            return (
              <tr key={m.toISOString()} className="border-t border-slate-100">
                <td className="px-3 py-1.5 whitespace-nowrap font-medium text-slate-700">{monthLong(m)}</td>
                <td className={`${td} text-sky-700`}>
                  {num(c.open)}
                  {c.openValue ? <span className="ml-1 text-[11px] text-slate-400">{formatCompactCurrency(c.openValue)}</span> : null}
                </td>
                <td className={`${td} text-violet-700`}>{num(c.converted)}</td>
                <td className={`${td} text-emerald-700`}>{num(c.won)}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-slate-100">
                      {c.wonValue > 0 && (
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-700"
                          style={{ width: `${Math.max(3, Math.round((c.wonValue / maxWon) * 100))}%` }}
                        />
                      )}
                    </div>
                    <span className="w-16 text-right text-xs font-semibold tabular-nums text-emerald-800">{money(c.wonValue)}</span>
                  </div>
                </td>
                <td className={`${td} text-rose-700`}>{num(c.lost)}</td>
                <td className={`${td} font-semibold ${closed ? (c.wonCrm / closed >= 0.5 ? "text-emerald-700" : "text-amber-700") : "text-slate-300"}`}>
                  {closed ? `${Math.round((c.wonCrm / closed) * 100)}%` : "-"}
                </td>
                <td className={td}>{c.won ? formatCompactCurrency(c.wonValue / c.won) : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}

// Won value per sales person per month, shaded by size (darker = more).
export function RepMonthMatrix({ data, targets }: { data: MonthlyPipeline; targets?: number[] }) {
  const { months, people, cells } = data;
  const at = (pid: string, i: number) => cells.get(`${pid}|${i}`)!;
  const max = Math.max(0, ...people.flatMap((p) => months.map((_, i) => at(p.id, i).wonValue)));
  const shade = (v: number) => {
    if (v <= 0 || max <= 0) return "";
    const r = v / max;
    return r > 0.75 ? "bg-emerald-500 text-white" : r > 0.5 ? "bg-emerald-400 text-white" : r > 0.25 ? "bg-emerald-200 text-emerald-900" : "bg-emerald-50 text-emerald-800";
  };
  const teamCells = months.map((_, i) => sum(people.map((p) => at(p.id, i))));
  const palette = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6", "#84cc16", "#f97316"];
  // Each month's won value stacked by sales person, with the team target as
  // a line - how much came in, from whom, and whether it made target.
  const chartData = months.map((m, i) => ({
    label: m.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
    ...Object.fromEntries(people.map((p) => [p.id, at(p.id, i).wonValue > 0 ? at(p.id, i).wonValue : 0])),
    target: targets?.[i] || null,
  }));
  const chartSeries: ComboSeries[] = [
    ...people.map((p, i): ComboSeries => ({ key: p.id, name: p.name.split(" ")[0], color: palette[i % palette.length], type: "bar", stack: "won" })),
    ...(targets?.some((x) => x > 0) ? [{ key: "target", name: "Team target", color: "#1e293b", type: "line", dashed: true } as ComboSeries] : []),
  ];
  return (
    <div className="space-y-3">
    {months.length > 0 && people.length > 0 && <ComboChart data={chartData} series={chartSeries} height={260} />}
    <div className="overflow-x-auto">
      <table className="w-full text-xs" data-own-head>
        <thead>
          <tr className="text-[10px] uppercase tracking-wide">
            <th className="px-2 py-1.5 text-left font-medium bg-slate-100 text-slate-600">Sales person</th>
            {months.map((m) => (
              <th key={m.toISOString()} className="px-2 py-1.5 text-right font-medium bg-emerald-50 text-emerald-800">
                {m.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })}
              </th>
            ))}
            <th className="px-2 py-1.5 text-right font-medium bg-emerald-100 text-emerald-900">Total</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => {
            const row = months.map((_, i) => at(p.id, i));
            const total = sum(row);
            return (
              <tr key={p.id} className="border-t border-white">
                <td className="px-2 py-1.5 whitespace-nowrap font-medium text-slate-700">{p.name}</td>
                {row.map((c, i) => (
                  <td key={i} className={`px-2 py-1.5 text-right tabular-nums rounded ${shade(c.wonValue)}`} title={`${c.won} won`}>
                    {c.wonValue ? formatCompactCurrency(c.wonValue) : <span className="text-slate-300">-</span>}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-emerald-900 bg-emerald-50/60">{total.wonValue ? formatCompactCurrency(total.wonValue) : "-"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
            <td className="px-2 py-1.5">Team</td>
            {teamCells.map((c, i) => (
              <td key={i} className="px-2 py-1.5 text-right tabular-nums">
                {c.wonValue ? formatCompactCurrency(c.wonValue) : "-"}
              </td>
            ))}
            <td className="px-2 py-1.5 text-right tabular-nums text-emerald-900">{formatCompactCurrency(sum(teamCells).wonValue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    </div>
  );
}

// The dashboard's one-month view: a row per sales person with the three.
export function PipelineThisMonth({ data }: { data: MonthlyPipeline }) {
  const { people, cells } = data;
  const rows = people.map((p) => ({ p, c: cells.get(`${p.id}|0`)! }));
  const t = sum(rows.map((r) => r.c));
  const td = "px-2 py-1.5 text-right tabular-nums";
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
          <th className="py-2 pr-3 font-medium">Sales person</th>
          <th className="px-2 py-2 text-right font-medium">Open deals</th>
          <th className="px-2 py-2 text-right font-medium">Open value</th>
          <th className="px-2 py-2 text-right font-medium">Converted from lead</th>
          <th className="px-2 py-2 text-right font-medium">Won</th>
          <th className="px-2 py-2 text-right font-medium">Won value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ p, c }) => (
          <tr key={p.id} className="border-t border-slate-100">
            <td className="py-1.5 pr-3 text-slate-700">{p.name}</td>
            <td className={td}>{c.open || "-"}</td>
            <td className={td}>{c.openValue ? formatCompactCurrency(c.openValue) : "-"}</td>
            <td className={td}>{c.converted || "-"}</td>
            <td className={td}>{c.won || "-"}</td>
            <td className={td}>{c.wonValue ? formatCompactCurrency(c.wonValue) : "-"}</td>
          </tr>
        ))}
      </tbody>
      {rows.length > 1 && (
        <tfoot>
          <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
            <td className="py-1.5 pr-3">Team</td>
            <td className={td}>{t.open}</td>
            <td className={td}>{formatCompactCurrency(t.openValue)}</td>
            <td className={td}>{t.converted}</td>
            <td className={td}>{t.won}</td>
            <td className={td}>{formatCompactCurrency(t.wonValue)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
