"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCompactCurrency } from "@/lib/format";
import { DEAL_STAGES, DEAL_STAGE_LABELS } from "@/lib/constants";
import type { DealStage } from "@prisma/client";

export type StageValueRow = { name: string } & Record<DealStage, number>;

export function StageValueChart({ data }: { data: StageValueRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
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
          formatter={(value, name) => [formatCompactCurrency(Number(value)), name]}
          contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {DEAL_STAGES.map((stage, i) => (
          <Bar
            key={stage}
            dataKey={stage}
            name={DEAL_STAGE_LABELS[stage]}
            stackId="stage"
            fill={STAGE_HEX[stage]}
            radius={i === DEAL_STAGES.length - 1 ? [4, 4, 0, 0] : undefined}
            maxBarSize={48}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// Bar fill needs a hex value; DEAL_STAGE_COLORS carries Tailwind classes for
// badges elsewhere, so map to the same hues here.
const STAGE_HEX: Record<DealStage, string> = {
  QUALIFICATION: "#94a3b8",
  NEEDS_ANALYSIS: "#0ea5e9",
  PROPOSAL: "#f59e0b",
  NEGOTIATION: "#8b5cf6",
  WON: "#10b981",
  LOST: "#f43f5e",
};
