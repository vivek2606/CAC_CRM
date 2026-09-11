"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCompactCurrency } from "@/lib/format";

export type WonLostRow = { name: string; won: number; lost: number };

// Used for both the month-wise trend and the sales-person-wise breakdown on
// the Closed Deals insights section - same shape (named row, Won vs Lost
// value) either way.
export function WonLostBarChart({ data }: { data: WonLostRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
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
        <Bar dataKey="won" name="Won" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="lost" name="Lost" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
