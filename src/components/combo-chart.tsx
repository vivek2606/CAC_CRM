"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from "recharts";
import { formatCompactCurrency } from "@/lib/format";

// A combination chart over months: bars for amounts that happen in a month
// (stackable, e.g. won value per sales person), lines for levels or targets
// (open pipeline, target), and counts / percentages on a right-hand axis.
export type ComboSeries = {
  key: string;
  name: string;
  color: string;
  type: "bar" | "line";
  axis?: "money" | "count" | "pct"; // default money
  stack?: string; // bars with the same stack id stack up
  dashed?: boolean;
};

const fmt = (axis: ComboSeries["axis"], v: number) => (axis === "count" ? String(v) : axis === "pct" ? `${v}%` : formatCompactCurrency(v));

export function ComboChart({ data, series, height = 260 }: { data: Record<string, string | number | null>[]; series: ComboSeries[]; height?: number }) {
  const right = series.find((s) => s.axis === "count" || s.axis === "pct")?.axis;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: right ? 4 : 16, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
        <YAxis yAxisId="money" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactCurrency(Number(v))} width={78} />
        {right && (
          <YAxis
            yAxisId={right}
            orientation="right"
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(v) => fmt(right, Number(v))}
          />
        )}
        <Tooltip
          cursor={{ fill: "rgba(99,102,241,0.06)" }}
          formatter={(value, name) => {
            const s = series.find((x) => x.name === name);
            return [value == null ? "-" : fmt(s?.axis ?? "money", Number(value)), name];
          }}
          contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12, boxShadow: "0 8px 24px rgba(15,23,42,.08)" }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series
          .filter((s) => s.type === "bar")
          .map((s, i, bars) => {
            const top = !s.stack || bars.filter((b) => b.stack === s.stack).at(-1)?.key === s.key;
            return (
              <Bar
                key={s.key}
                yAxisId={s.axis ?? "money"}
                dataKey={s.key}
                name={s.name}
                fill={s.color}
                stackId={s.stack}
                maxBarSize={44}
                radius={top ? [5, 5, 0, 0] : [0, 0, 0, 0]}
                animationDuration={800}
                animationBegin={i * 60}
              />
            );
          })}
        {series
          .filter((s) => s.type === "line")
          .map((s) => (
            <Line
              key={s.key}
              yAxisId={s.axis ?? "money"}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2.5}
              strokeDasharray={s.dashed ? "6 4" : undefined}
              dot={{ r: 3.5, strokeWidth: 0, fill: s.color }}
              activeDot={{ r: 5.5 }}
              connectNulls
              animationDuration={900}
              animationBegin={300}
            />
          ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
