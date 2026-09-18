"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LabelList, ResponsiveContainer } from "recharts";
import { formatCompactCurrency } from "@/lib/format";

export type TargetTrendRow = { month: string; target: number; actual: number };

const labelStyle = { fontSize: 9, fill: "#64748b" };

export function TargetTrendChart({ data }: { data: TargetTrendRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCompactCurrency(Number(v))}
          width={64}
        />
        <Tooltip
          formatter={(value) => formatCompactCurrency(Number(value))}
          contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="target" name="Target" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={22}>
          <LabelList dataKey="target" position="top" style={labelStyle} formatter={(v) => (Number(v) > 0 ? formatCompactCurrency(Number(v)) : "")} />
        </Bar>
        <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={22}>
          <LabelList dataKey="actual" position="top" style={labelStyle} formatter={(v) => (Number(v) > 0 ? formatCompactCurrency(Number(v)) : "")} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
