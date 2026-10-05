"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, ResponsiveContainer } from "recharts";
import { formatCompactCurrency, chartUnit } from "@/lib/format";

export type CategoryChartRow = { category: string; value: number };

export function CategoryChart({ data }: { data: CategoryChartRow[] }) {
  const height = Math.max(220, data.length * 40);
  // Bare whole numbers on the bars, in the same unit as the value axis.
  const { label, axisTick } = chartUnit(data.map((r) => r.value));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 48, left: 8, bottom: 0 }}>
        <XAxis
          type="number"
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={axisTick}
        />
        <YAxis
          type="category"
          dataKey="category"
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          width={140}
        />
        <Tooltip
          formatter={(value) => formatCompactCurrency(Number(value))}
          contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13 }}
        />
        <Bar dataKey="value" name="Sales Value" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={22}>
          <LabelList
            dataKey="value"
            position="right"
            style={{ fontSize: 11, fontWeight: 700, fill: "#334155" }}
            formatter={label}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
