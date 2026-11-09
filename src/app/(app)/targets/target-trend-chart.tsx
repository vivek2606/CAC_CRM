"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, LabelList, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatCompactCurrency, chartUnit } from "@/lib/format";

// lastYear: the same month a year before; avg3: the 3-month moving average
// of sales - so a seasonal peak or dip isn't read as a trend.
export type TargetTrendRow = { month: string; target: number; actual: number; lastYear?: number | null; lastYearTarget?: number | null; avg3?: number | null };

const ach = (a: number, t: number | null | undefined) => (t ? ` (${Math.round((a / t) * 100)}% of target)` : "");

// Hover: sales and achievement this year and the same month last year.
function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TargetTrendRow }[] }) {
  const r = payload?.[0]?.payload;
  if (!active || !r) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-semibold text-slate-900">{r.month}</p>
      <p className="text-emerald-700">
        Sales {formatCompactCurrency(r.actual)}
        {ach(r.actual, r.target)}
      </p>
      {r.target ? <p className="text-indigo-600">Target {formatCompactCurrency(r.target)}</p> : null}
      {r.lastYear != null && (
        <p className="text-slate-500">
          Same month last year {formatCompactCurrency(r.lastYear)}
          {ach(r.lastYear, r.lastYearTarget)}
        </p>
      )}
      {r.avg3 != null && <p className="text-amber-600">3-month average {formatCompactCurrency(r.avg3)}</p>}
    </div>
  );
}

const labelStyle = { fontSize: 10, fontWeight: 700, fill: "#334155" };

export function TargetTrendChart({ data }: { data: TargetTrendRow[] }) {
  const { label, axisTick } = chartUnit(data.flatMap((r) => [r.target, r.actual, r.lastYear ?? 0]));
  const hasLastYear = data.some((r) => (r.lastYear ?? 0) > 0);
  const hasAvg = data.some((r) => r.avg3 != null);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data.map((r) => ({ ...r, target: r.target || null, lyLabel: r.lastYear ? `${label(r.lastYear)}${r.lastYearTarget ? ` · ${Math.round((r.lastYear / r.lastYearTarget) * 100)}%` : ""}` : "" }))} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={axisTick}
          width={64}
        />
        <Tooltip content={<TrendTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[5, 5, 0, 0]} maxBarSize={28} animationDuration={900}>
          <LabelList dataKey="actual" position="top" style={labelStyle} formatter={label} />
        </Bar>
        {hasLastYear && (
          <Bar dataKey="lastYear" name="Same month last year" fill="#cbd5e1" radius={[5, 5, 0, 0]} maxBarSize={20} animationDuration={900}>
            <LabelList dataKey="lyLabel" position="top" style={{ ...labelStyle, fill: "#94a3b8" }} />
          </Bar>
        )}
        {hasAvg && (
          <Line dataKey="avg3" name="3-month average" type="monotone" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 5 }} animationDuration={900} />
        )}
        {/* The target as a line over the bars (months without one leave a gap). */}
        <Line
          dataKey="target"
          name="Target"
          type="monotone"
          stroke="#6366f1"
          strokeWidth={2.5}
          strokeDasharray="6 4"
          dot={{ r: 4, fill: "#6366f1", strokeWidth: 0 }}
          activeDot={{ r: 6 }}
          animationDuration={900}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
