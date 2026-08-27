"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCompactCurrency } from "@/lib/format";

// One hue, light -> dark, since years are an ordered progression rather than
// unrelated categories.
const YEAR_SHADES = ["#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#4f46e5", "#4338ca"];

function shadeFor(index: number, total: number): string {
  if (total <= 1) return YEAR_SHADES[YEAR_SHADES.length - 1];
  const idx = Math.round((index / (total - 1)) * (YEAR_SHADES.length - 1));
  return YEAR_SHADES[idx];
}

export type CategoryYearRow = { category: string } & Record<string, number | string>;

export function CategoryYearCompareChart({ data, years }: { data: CategoryYearRow[]; years: number[] }) {
  const height = Math.max(240, data.length * 48);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
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
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {years.map((year, i) => (
          <Bar
            key={year}
            dataKey={String(year)}
            name={String(year)}
            fill={shadeFor(i, years.length)}
            radius={[0, 4, 4, 0]}
            maxBarSize={16}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
