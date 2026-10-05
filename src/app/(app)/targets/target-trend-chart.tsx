"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LabelList, ResponsiveContainer } from "recharts";
import { formatCompactCurrency, chartUnit } from "@/lib/format";

export type TargetTrendRow = { month: string; target: number; actual: number };

const labelStyle = { fontSize: 10, fontWeight: 700, fill: "#334155" };

export function TargetTrendChart({ data }: { data: TargetTrendRow[] }) {
  const { label, axisTick } = chartUnit(data.flatMap((r) => [r.target, r.actual]));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }} barGap={6}>
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
        <Bar dataKey="target" name="Target" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={20}>
          <LabelList dataKey="target" position="top" style={labelStyle} formatter={label} />
        </Bar>
        <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={20}>
          <LabelList dataKey="actual" position="top" style={labelStyle} formatter={label} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
