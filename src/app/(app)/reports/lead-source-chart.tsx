"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatCompactCurrency } from "@/lib/format";

export type LeadSourceRow = { source: string; count: number; value: number; fill: string };

export function LeadSourceChart({ data }: { data: LeadSourceRow[] }) {
  const height = Math.max(data.length * 36 + 24, 120);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
        barCategoryGap={10}
      >
        <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="source"
          tick={{ fontSize: 12, fill: "#334155" }}
          axisLine={false}
          tickLine={false}
          width={90}
        />
        <Tooltip
          formatter={(value, _name, item) => {
            const v = (item?.payload as { value?: number } | undefined)?.value ?? 0;
            return [`${value} lead${Number(value) === 1 ? "" : "s"} · ${formatCompactCurrency(v)}`, "Count"];
          }}
          contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13 }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((entry) => (
            <Cell key={entry.source} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
