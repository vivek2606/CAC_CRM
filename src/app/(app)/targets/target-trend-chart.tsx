"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LabelList, ResponsiveContainer } from "recharts";
import { formatCompactCurrency } from "@/lib/format";

export type TargetTrendRow = { month: string; target: number; actual: number };

const labelStyle = { fontSize: 10, fontWeight: 700, fill: "#334155" };

// One unit for the whole chart, picked from the largest bar, so the bare
// numbers above the bars always read in the same unit as the Y axis
// (e.g. axis "₦400M", label "452").
function chartUnit(data: TargetTrendRow[]): { divisor: number; suffix: string } {
  const max = Math.max(0, ...data.flatMap((r) => [r.target, r.actual]));
  if (max >= 1e10) return { divisor: 1e9, suffix: "B" };
  if (max >= 1e6) return { divisor: 1e6, suffix: "M" };
  if (max >= 1e3) return { divisor: 1e3, suffix: "K" };
  return { divisor: 1, suffix: "" };
}

export function TargetTrendChart({ data }: { data: TargetTrendRow[] }) {
  const { divisor, suffix } = chartUnit(data);
  const inUnit = (v: number) => Math.round(v / divisor).toLocaleString("en-NG");
  const label = (v: unknown) => (Number(v) > 0 ? inUnit(Number(v)) : "");

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }} barGap={6}>
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (Number(v) === 0 ? "₦0" : `₦${inUnit(Number(v))}${suffix}`)}
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
