"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LabelList, ResponsiveContainer } from "recharts";
import { formatCompactCurrency, chartUnit } from "@/lib/format";

// One row per month: { month, target, [seriesKey]: actual, ... }
export type YtdRepChartRow = { month: string; target: number } & Record<string, number | string>;
export type YtdRepSeries = { key: string; name: string };

// Categorical hues in fixed order for the individual reps - a rep keeps the
// same colour as long as the rep list order (alphabetical) doesn't change.
// "Others" has a fixed grey of its own.
const REP_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#e34948"];
const FIXED_COLORS: Record<string, string> = { others: "#94a3b8" };

export function YtdRepChart({ data, series }: { data: YtdRepChartRow[]; series: YtdRepSeries[] }) {
  // Each month's department total, labelled on top of its stack as a bare
  // whole number in the same unit as the Y axis.
  const rows = data.map((r) => ({ ...r, __total: series.reduce((s, x) => s + Number(r[x.key] ?? 0), 0) }));
  const { label, axisTick } = chartUnit(rows.flatMap((r) => [r.__total, r.target]));
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={rows} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={axisTick}
          width={64}
        />
        <Tooltip
          formatter={(value) => formatCompactCurrency(Number(value))}
          contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13 }}
          cursor={{ fill: "#f8fafc" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stackId="actual"
            fill={FIXED_COLORS[s.key] ?? REP_COLORS[i % REP_COLORS.length]}
            stroke="#ffffff"
            strokeWidth={1}
            maxBarSize={36}
          >
            {i === series.length - 1 && (
              <LabelList dataKey="__total" position="top" style={{ fontSize: 11, fontWeight: 700, fill: "#334155" }} formatter={label} />
            )}
          </Bar>
        ))}
        <Line
          type="monotone"
          dataKey="target"
          name="Dept. target"
          stroke="#0f172a"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={{ r: 3, fill: "#0f172a" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
