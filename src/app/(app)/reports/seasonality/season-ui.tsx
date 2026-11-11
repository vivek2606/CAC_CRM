"use client";

import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { MONTHS_SHORT, splitByPattern } from "@/lib/seasonality-shared";
import { chartUnit, formatCompactCurrency } from "@/lib/format";

const YEAR_COLORS = ["#cbd5e1", "#94a3b8", "#6366f1", "#10b981"];

// One category's months, a line per year.
export function SeasonChart({ byYear, years, units }: { byYear: Record<number, number[]>; years: number[]; units: boolean }) {
  const data = MONTHS_SHORT.map((m, i) => Object.fromEntries([["month", m], ...years.map((y) => [String(y), byYear[y][i] || null])]));
  const { axisTick } = chartUnit(years.flatMap((y) => byYear[y]), units ? "" : "₦");
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
        <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={axisTick} axisLine={false} tickLine={false} width={60} />
        <Tooltip formatter={(v) => (units ? `${Number(v).toLocaleString("en-NG")} units` : formatCompactCurrency(Number(v)))} contentStyle={{ borderRadius: 8, fontSize: 13 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {years.map((y, i) => (
          <Line key={y} dataKey={String(y)} stroke={YEAR_COLORS[(i + YEAR_COLORS.length - years.length) % YEAR_COLORS.length]} strokeWidth={i === years.length - 1 ? 3 : 2} dot={false} connectNulls={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// A yearly target split into months by a category's pattern.
export function TargetSplitter({ patterns }: { patterns: { category: string; share: number[] }[] }) {
  const [category, setCategory] = useState(patterns[0]?.category ?? "");
  const [total, setTotal] = useState("");
  const amount = Number(total.replace(/[^\d.]/g, "")) || 0;
  const share = patterns.find((p) => p.category === category)?.share ?? [];
  const parts = amount ? splitByPattern(amount, share) : [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-500">
          <span className="mb-1 block">Yearly target (₦)</span>
          <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="numeric" placeholder="e.g. 1,200,000,000" className="w-48 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-medium text-slate-500">
          <span className="mb-1 block">Split by the pattern of</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            {patterns.map((p) => (
              <option key={p.category}>{p.category}</option>
            ))}
          </select>
        </label>
      </div>
      {amount > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                {MONTHS_SHORT.map((m) => (
                  <th key={m} className="py-1 pr-2 text-right font-medium">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {parts.map((v, i) => (
                  <td key={i} className="py-1 pr-2 text-right tabular-nums">
                    {formatCompactCurrency(v)}
                  </td>
                ))}
              </tr>
              <tr className="text-xs text-slate-400">
                {share.map((s, i) => (
                  <td key={i} className="pr-2 text-right tabular-nums">
                    {s.toFixed(1)}%
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-500">A starting point for each month&apos;s target - adjust for known projects and stock, then set them in Targets.</p>
        </div>
      )}
    </div>
  );
}
