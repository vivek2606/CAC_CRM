"use client";

import { AreaChart, Area, Tooltip, ResponsiveContainer } from "recharts";
import { formatCompactCurrency } from "@/lib/format";

export type SparklinePoint = { label: string; value: number };

// A minimal trend strip for a stat tile - no axes/gridlines, the hero
// number above it is still the primary, always-visible value; this is
// supplementary context, so a light hover tooltip is enough interaction.
export function Sparkline({ data }: { data: SparklinePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
        <defs>
          <linearGradient id="sparklineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          formatter={(value) => [formatCompactCurrency(Number(value)), "Sales"]}
          contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 12, padding: "4px 8px" }}
          labelStyle={{ fontSize: 11, color: "#64748b" }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#sparklineFill)"
          dot={false}
          activeDot={{ r: 3 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
