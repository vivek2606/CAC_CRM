"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, ResponsiveContainer } from "recharts";
import { formatCompactCurrency } from "@/lib/format";

export type CategoryChartRow = { category: string; value: number };

export function CategoryChart({ data }: { data: CategoryChartRow[] }) {
  const height = Math.max(220, data.length * 40);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 48, left: 8, bottom: 0 }}>
        <XAxis
          type="number"
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCompactCurrency(Number(v))}
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
            style={{ fontSize: 11, fill: "#64748b" }}
            formatter={(v) => (Number(v) > 0 ? formatCompactCurrency(Number(v)) : "")}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
