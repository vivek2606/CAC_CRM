"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCompactCurrency } from "@/lib/format";

export type LeadSourceRow = { source: string; count: number; value: number; fill: string };

export function LeadSourceChart({ data }: { data: LeadSourceRow[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="source"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
          labelLine={false}
        >
          {data.map((entry) => (
            <Cell key={entry.source} fill={entry.fill} stroke="#fff" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name, item) => {
            const v = (item?.payload as { value?: number } | undefined)?.value ?? 0;
            const pct = total > 0 ? Math.round((Number(value) / total) * 100) : 0;
            return [`${value} lead${Number(value) === 1 ? "" : "s"} (${pct}%) · ${formatCompactCurrency(v)}`, name];
          }}
          contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
