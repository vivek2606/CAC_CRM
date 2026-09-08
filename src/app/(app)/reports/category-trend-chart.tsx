"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";

export type CategoryTrendRow = { month: string } & Record<string, number | string>;

// Stacked column: one bar per month, segments = category share of that
// month's sales - shows composition changing over time, which a single-
// period snapshot can't. Categories/colors are decided by the caller
// (ranked largest-first, "Other" folded per the series-count ladder).
export function CategoryTrendChart({
  data,
  categories,
  colors,
}: {
  data: CategoryTrendRow[];
  categories: string[];
  colors: Record<string, string>;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCompactCurrency(Number(v))}
          width={56}
        />
        <Tooltip
          formatter={(value, name) => [formatCurrency(Number(value)), name]}
          contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {categories.map((category) => (
          <Bar
            key={category}
            dataKey={category}
            name={category}
            stackId="month"
            fill={colors[category] ?? "#94a3b8"}
            stroke="#fff"
            strokeWidth={2}
            radius={0}
            maxBarSize={40}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
