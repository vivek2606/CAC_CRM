import { formatCompactCurrency } from "@/lib/format";
import type { AccuracyRow } from "@/lib/forecast-accuracy";

// Forecast vs actual, month by month: the weighted forecast saved at the
// start of each month, and how much of those deals was won in the month.
const monthName = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const tone = (p: number | null) => (p == null ? "text-slate-400" : p < 60 ? "text-rose-700" : p > 140 ? "text-sky-700" : "text-emerald-700");
const verdict = (p: number | null) => (p == null ? "" : p < 60 ? "over-forecasts" : p > 140 ? "under-forecasts" : "on the mark");

export function ForecastAccuracyTable({ months, rows }: { months: string[]; rows: AccuracyRow[] }) {
  const shown = rows.filter((r) => r.cells.some((c) => c.forecast > 0 || c.won > 0));
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-900">Forecast vs actual</h2>
      <p className="mb-3 text-xs text-slate-500">
        Each month&apos;s forecast is saved on the 1st: open deals expected to close that month, weighted by winning probability. Won = how much of those same deals was won that month. Well
        under 100% month after month means the probabilities or close dates are too optimistic.
      </p>
      {months.length === 0 || shown.length === 0 ? (
        <p className="text-sm text-slate-500">Saved from this month on - the comparison builds up month by month.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-1.5 pr-3 font-medium">Sales person</th>
                {months.map((m, i) => (
                  <th key={m} className="py-1.5 pr-3 text-right font-medium">
                    {monthName(m)}
                    {i === months.length - 1 && rows[0]?.cells[i]?.current ? " (so far)" : ""}
                  </th>
                ))}
                <th className="py-1.5 text-right font-medium">Average</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <tr key={r.userId} className="align-top">
                  <td className="py-1.5 pr-3 text-slate-800">{r.name}</td>
                  {r.cells.map((c) => (
                    <td key={c.month} className="py-1.5 pr-3 text-right tabular-nums" title={`Forecast ${formatCompactCurrency(c.forecast)}, won ${formatCompactCurrency(c.won)}`}>
                      <div className={`font-semibold ${c.current ? "text-slate-500" : tone(c.pct)}`}>{c.pct == null ? "-" : `${c.pct}%`}</div>
                      <div className="text-[11px] text-slate-400">
                        {formatCompactCurrency(c.won)} / {formatCompactCurrency(c.forecast)}
                      </div>
                    </td>
                  ))}
                  <td className="py-1.5 text-right">
                    <div className={`font-semibold tabular-nums ${tone(r.avgPct)}`}>{r.avgPct == null ? "-" : `${r.avgPct}%`}</div>
                    <div className="text-[11px] text-slate-500">{verdict(r.avgPct)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-400">Won / forecast under each %. The average leaves out the month still running.</p>
        </div>
      )}
    </div>
  );
}
