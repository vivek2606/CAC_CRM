"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LabelList, ResponsiveContainer } from "recharts";
import { formatCompactCurrency, chartUnit } from "@/lib/format";

const labelStyle = { fontSize: 10, fontWeight: 700, fill: "#334155" };

export function RepComparisonChart({ data }: { data: { name: string; open: number; won: number }[] }) {
  // Bare whole numbers on the bars, in the same unit as the value axis.
  const { label, axisTick } = chartUnit(data.flatMap((r) => [r.open, r.won]));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }} barGap={6}>
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
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
        <Bar dataKey="open" name="Open Pipeline" fill="#a5b4fc" radius={[6, 6, 0, 0]} maxBarSize={28}>
          <LabelList dataKey="open" position="top" style={labelStyle} formatter={label} />
        </Bar>
        <Bar dataKey="won" name="Won (Quarter)" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={28}>
          <LabelList dataKey="won" position="top" style={labelStyle} formatter={label} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
