"use client";

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";

export type WaterfallStep = {
  name: string;
  // Signed change vs the running total (0 for the two "total" columns,
  // whose absolute value is carried in `display` instead).
  delta: number;
  display: number;
  kind: "total" | "new" | "lost" | "won";
};

type WaterfallRow = { name: string; base: number; delta: number; kind: WaterfallStep["kind"]; display: number };

const KIND_COLOR: Record<WaterfallStep["kind"], string> = {
  total: "#6366f1", // indigo - matches the app's primary accent
  new: "#0ea5e9", // sky - new deals entering the pipeline (neutral movement)
  lost: "#f43f5e", // rose - same "bad" status color as LOST elsewhere
  won: "#10b981", // emerald - same "good" status color as WON elsewhere
};

// Waterfall via a floating stacked bar: an invisible `base` segment lifts
// each bar to its starting height, and the visible `delta` segment on top
// shows the step's change, colored by what kind of movement it is - Won
// deals leaving the pipeline get the same "good" emerald as everywhere
// else in the app, even though they reduce the pipeline number, since a
// waterfall's color job is "is this movement good or bad," not the sign
// of the number.
export function PipelineWaterfallChart({ steps }: { steps: WaterfallStep[] }) {
  const rows = steps.reduce<{ rows: WaterfallRow[]; running: number }>(
    (acc, s) => {
      if (s.kind === "total") {
        acc.rows.push({ name: s.name, base: 0, delta: s.display, kind: s.kind, display: s.display });
        return { rows: acc.rows, running: s.display };
      }
      const base = s.delta >= 0 ? acc.running : acc.running + s.delta;
      acc.rows.push({ name: s.name, base, delta: Math.abs(s.delta), kind: s.kind, display: s.delta });
      return { rows: acc.rows, running: acc.running + s.delta };
    },
    { rows: [], running: 0 }
  ).rows;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCompactCurrency(Number(v))}
          width={56}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as (typeof rows)[number];
            const sign = row.kind === "total" ? "" : row.display >= 0 ? "+" : "-";
            return (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
                <p className="font-medium text-slate-700">{row.name}</p>
                <p className="text-slate-500">
                  {sign}
                  {formatCurrency(Math.abs(row.display))}
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="delta" stackId="wf" radius={4} maxBarSize={56}>
          {rows.map((r, i) => (
            <Cell key={i} fill={KIND_COLOR[r.kind]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
