"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatCompactCurrency } from "@/lib/format";

const STAGE_BAR_COLORS: Record<string, string> = {
  Qualification: "#94a3b8",
  "Needs Analysis": "#0ea5e9",
  Proposal: "#f59e0b",
  Negotiation: "#8b5cf6",
};

export function PipelineChart({ data }: { data: { stage: string; value: number; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <XAxis dataKey="stage" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCompactCurrency(Number(v))}
          width={64}
        />
        <Tooltip
          formatter={(value, _name, item) => {
            const count = (item?.payload as { count?: number } | undefined)?.count ?? 0;
            return [
              `${formatCompactCurrency(Number(value))} · ${count} deal${count === 1 ? "" : "s"}`,
              "Pipeline",
            ];
          }}
          contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13 }}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
          {data.map((entry) => (
            <Cell key={entry.stage} fill={STAGE_BAR_COLORS[entry.stage] ?? "#94a3b8"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
