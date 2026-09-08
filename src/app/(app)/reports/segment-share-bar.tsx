"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatCompactCurrency } from "@/lib/format";

export type ShareBarRow = { label: string; count: number; value: number; fill: string };

// 100%-stacked bar: a single row, segments sized by share of the whole -
// the "part-to-whole" job a 6-slice pie chart handles poorly (hard to
// compare slice angles past 2-3). stackOffset="expand" normalizes each
// segment to its share of the row's total.
export function ShareStackedBar({ data, unitLabel = "deal" }: { data: ShareBarRow[]; unitLabel?: string }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const row: Record<string, number | string> = { name: "" };
  for (const d of data) row[d.label] = d.count;

  return (
    <div>
      <ResponsiveContainer width="100%" height={56}>
        <BarChart data={[row]} layout="vertical" stackOffset="expand" margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" hide width={0} />
          <Tooltip
            formatter={(value, name) => {
              const pct = total > 0 ? Math.round((Number(value) / total) * 100) : 0;
              return [`${value} ${unitLabel}${Number(value) === 1 ? "" : "s"} (${pct}%)`, name];
            }}
            contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13 }}
          />
          {data.map((d) => (
            <Bar key={d.label} dataKey={d.label} name={d.label} stackId="share" fill={d.fill} stroke="#fff" strokeWidth={2} radius={4} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
          return (
            <div key={d.label} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.fill }} />
              <span className="font-medium text-slate-700">{d.label}</span>
              <span className="text-slate-400">
                {pct}% · {formatCompactCurrency(d.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
