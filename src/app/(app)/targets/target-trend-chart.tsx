"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, LabelList, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatCompactCurrency, chartUnit } from "@/lib/format";

export type TargetTrendRow = { month: string; target: number; actual: number };

const labelStyle = { fontSize: 10, fontWeight: 700, fill: "#334155" };

export function TargetTrendChart({ data }: { data: TargetTrendRow[] }) {
  const { label, axisTick } = chartUnit(data.flatMap((r) => [r.target, r.actual]));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data.map((r) => ({ ...r, target: r.target || null }))} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#eef2f7" vertical={false} />
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
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[5, 5, 0, 0]} maxBarSize={28} animationDuration={900}>
          <LabelList dataKey="actual" position="top" style={labelStyle} formatter={label} />
        </Bar>
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
