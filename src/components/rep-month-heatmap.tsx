import { formatCompactCurrency } from "@/lib/format";

export type HeatmapRow = { repName: string; values: number[] };

// Sequential, one hue (indigo, the app's primary accent) light -> dark,
// scaled against the single highest cell in the whole matrix - not
// per-row - so a color is comparable across every rep and month, not
// just within one rep's own range.
const STEPS: { min: number; bg: string; text: string }[] = [
  { min: 0, bg: "bg-slate-50", text: "text-slate-300" },
  { min: 0.01, bg: "bg-indigo-100", text: "text-indigo-700" },
  { min: 0.25, bg: "bg-indigo-300", text: "text-indigo-900" },
  { min: 0.5, bg: "bg-indigo-500", text: "text-white" },
  { min: 0.75, bg: "bg-indigo-700", text: "text-white" },
];

function stepFor(value: number, max: number): { bg: string; text: string } {
  if (value <= 0 || max <= 0) return STEPS[0];
  const t = value / max;
  let step = STEPS[0];
  for (const s of STEPS) if (t >= s.min) step = s;
  return step;
}

// A rep x month matrix - a heatmap answers "who's been hot and when" at a
// glance, a job a bar chart with 6+ reps x 6+ months can't do without
// becoming unreadable. Used for both Won value (currency) and counts (e.g.
// new accounts opened) via formatValue/legendLabel.
export function RepMonthHeatmap({
  months,
  data,
  formatValue = formatCompactCurrency,
  legendLabel = "More won value",
  totalRow,
}: {
  months: string[];
  data: HeatmapRow[];
  formatValue?: (value: number) => string;
  legendLabel?: string;
  // An optional department-total row, shown pinned below the reps with a
  // fixed neutral style rather than the sequential ramp - a monthly total
  // is always the largest number in the matrix, so folding it into `data`
  // would recalibrate `max` and wash out every rep's own color.
  totalRow?: HeatmapRow;
}) {
  const max = Math.max(0, ...data.flatMap((r) => r.values));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-separate" style={{ borderSpacing: "3px" }}>
        <thead>
          <tr>
            <th className="text-left font-medium text-slate-500 pr-3 pb-1 sticky left-0 bg-white">Sales Manager</th>
            {months.map((m) => (
              <th key={m} className="font-medium text-slate-500 pb-1 min-w-[64px]">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.repName}>
              <td className="pr-3 py-0.5 font-medium text-slate-700 whitespace-nowrap sticky left-0 bg-white">
                {row.repName}
              </td>
              {row.values.map((value, i) => {
                const step = stepFor(value, max);
                return (
                  <td key={i} className="p-0">
                    <div
                      title={`${row.repName} · ${months[i]}: ${formatValue(value)}`}
                      className={`h-9 rounded-md flex items-center justify-center font-medium tabular-nums ${step.bg} ${step.text}`}
                    >
                      {value > 0 ? formatValue(value) : ""}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
          {totalRow && (
            <tr className="border-t border-slate-200">
              <td className="pr-3 py-1 pt-2 font-semibold text-slate-800 whitespace-nowrap sticky left-0 bg-white">
                {totalRow.repName}
              </td>
              {totalRow.values.map((value, i) => (
                <td key={i} className="p-0 pt-2">
                  <div
                    title={`${totalRow.repName} · ${months[i]}: ${formatValue(value)}`}
                    className="h-9 rounded-md flex items-center justify-center font-semibold tabular-nums bg-slate-100 text-slate-800"
                  >
                    {value > 0 ? formatValue(value) : ""}
                  </div>
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center gap-1.5 mt-3 text-xs text-slate-400">
        <span>Less</span>
        {STEPS.map((s) => (
          <span key={s.bg} className={`h-3 w-5 rounded-sm ${s.bg}`} />
        ))}
        <span>{legendLabel}</span>
      </div>
    </div>
  );
}
