"use client";

import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from "recharts";
import { formatCompactCurrency } from "@/lib/format";

// Lines over months. Each series is money (left axis) or a count (right
// axis); the first money series gets a soft area fill underneath.
export type LineSeries = { key: string; name: string; color: string; kind: "money" | "count"; dashed?: boolean };

export function LineTrendChart({
  data,
  series,
  height = 260,
  area = true,
}: {
  data: Record<string, string | number | null>[];
  series: LineSeries[];
  height?: number;
  // Shade under the first money line (off when every line is a peer, e.g. one per person).
  area?: boolean;
}) {
  const hasCount = series.some((s) => s.kind === "count");
  const firstMoney = area ? series.find((s) => s.kind === "money")?.key : undefined;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: hasCount ? 8 : 16, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
        <YAxis yAxisId="money" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactCurrency(Number(v))} width={78} />
        {hasCount && <YAxis yAxisId="count" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={32} />}
        <Tooltip
          formatter={(value, name) => {
            const s = series.find((x) => x.name === name);
            return [s?.kind === "money" ? formatCompactCurrency(Number(value)) : String(value), name];
          }}
          contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12, boxShadow: "0 8px 24px rgba(15,23,42,.08)" }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
        {firstMoney && (
          <Area yAxisId="money" type="monotone" dataKey={firstMoney} stroke="none" fill={`url(#fill-${firstMoney})`} legendType="none" tooltipType="none" animationDuration={900} />
        )}
        {series.map((s) => (
          <Line
            key={s.key}
            yAxisId={s.kind}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={s.kind === "money" ? 2.5 : 2}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            dot={{ r: 3, strokeWidth: 0, fill: s.color }}
            activeDot={{ r: 5 }}
            connectNulls
            animationDuration={900}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
