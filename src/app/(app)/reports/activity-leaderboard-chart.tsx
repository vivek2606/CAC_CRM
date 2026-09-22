"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

export type ActivityLeaderboardRow = {
  name: string;
  CALL: number;
  EMAIL: number;
  MEETING: number;
  TASK: number;
};

// Same fixed categorical order/hues as the app's other 4-step categorical
// charts (e.g. LEAD_SOURCE_COLORS' first four steps) - kept consistent
// app-wide rather than picked fresh per chart.
const TYPE_LABELS: Record<"CALL" | "EMAIL" | "MEETING" | "TASK", string> = {
  CALL: "Calls",
  EMAIL: "Emails",
  MEETING: "Meetings",
  TASK: "Tasks",
};
const TYPE_HEX: Record<"CALL" | "EMAIL" | "MEETING" | "TASK", string> = {
  CALL: "#3b82f6",
  EMAIL: "#f97316",
  MEETING: "#14b8a6",
  TASK: "#f59e0b",
};
const TYPE_ORDER: ("CALL" | "EMAIL" | "MEETING" | "TASK")[] = ["CALL", "EMAIL", "MEETING", "TASK"];

export function ActivityLeaderboardChart({ data }: { data: ActivityLeaderboardRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {TYPE_ORDER.map((type, i) => (
          <Bar
            key={type}
            dataKey={type}
            name={TYPE_LABELS[type]}
            stackId="activity"
            fill={TYPE_HEX[type]}
            radius={i === TYPE_ORDER.length - 1 ? [4, 4, 0, 0] : undefined}
            maxBarSize={48}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
