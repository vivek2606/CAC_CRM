"use client";

import { useMemo } from "react";
import { CategoryChart } from "../category-chart";
import { CategoryTrendChart, type CategoryTrendRow } from "../category-trend-chart";
import { assignCategoryColors, CATEGORY_OTHER_COLOR, MAX_CATEGORY_SLOTS, OTHER_CATEGORY_LABEL } from "@/lib/category-colors";
import { formatCurrency } from "@/lib/format";
import type { RegisterRow } from "./register-table";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Charts for the Sales Register, drawn from exactly the lines the table is
// showing - every period, sales person, product type or column filter
// applied to the table updates them. Clicking a bar filters the table.
export function RegisterCharts({
  rows,
  showSalesPerson,
  onPickCategory,
  onPickSalesPerson,
}: {
  rows: RegisterRow[];
  showSalesPerson: boolean;
  onPickCategory: (category: string) => void;
  onPickSalesPerson: (name: string) => void;
}) {
  const data = useMemo(() => {
    const byCat = new Map<string, { value: number; qty: number; lines: number }>();
    const byPerson = new Map<string, number>();
    const periods = new Set<string>();
    for (const r of rows) {
      const c = byCat.get(r.category) ?? { value: 0, qty: 0, lines: 0 };
      c.value += r.amount;
      c.qty += r.qty;
      c.lines += 1;
      byCat.set(r.category, c);
      byPerson.set(r.salesPerson, (byPerson.get(r.salesPerson) ?? 0) + r.amount);
      periods.add(r.invoiceDate.slice(0, 7));
    }
    const categories = [...byCat.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.value - a.value);
    const total = categories.reduce((s, c) => s + c.value, 0);
    const people = [...byPerson.entries()].map(([category, value]) => ({ category, value })).sort((a, b) => b.value - a.value);

    // Mix over time: by month, or by year when the lines span more than 2 years.
    const months = [...periods].sort();
    const byYear = months.length > 24;
    const bucket = (iso: string) => (byYear ? iso.slice(0, 4) : iso.slice(0, 7));
    const buckets: string[] = [];
    if (months.length) {
      if (byYear) {
        for (let y = Number(months[0].slice(0, 4)); y <= Number(months[months.length - 1].slice(0, 4)); y++) buckets.push(String(y));
      } else {
        let [y, m] = months[0].split("-").map(Number);
        const last = months[months.length - 1];
        for (;;) {
          const key = `${y}-${String(m).padStart(2, "0")}`;
          buckets.push(key);
          if (key >= last) break;
          m++;
          if (m > 12) [y, m] = [y + 1, 1];
        }
      }
    }
    const ranked = categories.map((c) => c.category);
    const colorMap = assignCategoryColors(ranked);
    const top = ranked.slice(0, MAX_CATEGORY_SLOTS);
    const hasOther = ranked.length > MAX_CATEGORY_SLOTS;
    const trendCats = hasOther ? [...top, OTHER_CATEGORY_LABEL] : top;
    const cell = new Map<string, number>();
    for (const r of rows) {
      const cat = top.includes(r.category) ? r.category : OTHER_CATEGORY_LABEL;
      const k = `${bucket(r.invoiceDate)}|${cat}`;
      cell.set(k, (cell.get(k) ?? 0) + r.amount);
    }
    const trend: CategoryTrendRow[] = buckets.map((b) => {
      const row: CategoryTrendRow = { month: byYear ? b : `${MONTHS[Number(b.slice(5, 7)) - 1]} ${b.slice(2, 4)}` };
      for (const c of trendCats) row[c] = cell.get(`${b}|${c}`) ?? 0;
      return row;
    });
    const colors: Record<string, string> = { [OTHER_CATEGORY_LABEL]: CATEGORY_OTHER_COLOR };
    for (const [c, col] of colorMap) colors[c] = col;
    return { categories, total, people, trend, trendCats, colors, byYear };
  }, [rows]);

  if (rows.length === 0) return null;
  const card = "rounded-xl border border-slate-200 bg-white p-4";

  const totalQty = data.categories.reduce((t, c) => t + c.qty, 0);
  const qtyFmt = (n: number) => n.toLocaleString("en-NG", { maximumFractionDigits: 2 });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      <div className={card}>
        <h2 className="text-sm font-semibold text-slate-900">Sales by product type</h2>
        <p className="text-xs text-slate-400 mb-2">Click a bar to filter the table to that type.</p>
        <CategoryChart data={data.categories.map((c) => ({ category: c.category, value: c.value }))} onSelect={onPickCategory} />
      </div>
      <div className={card}>
        <h2 className="text-sm font-semibold text-slate-900">Product type summary</h2>
        <p className="text-xs text-slate-400 mb-2">Totals for the lines shown below. Click a type to filter the table.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-2 font-medium">Product type</th>
                <th className="py-2 px-2 font-medium text-right">Lines</th>
                <th className="py-2 px-2 font-medium text-right">Qty</th>
                <th className="py-2 px-2 font-medium text-right">Sales value (excl. VAT)</th>
                <th className="py-2 pl-2 font-medium text-right">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.categories.map((c) => (
                <tr key={c.category} className="hover:bg-slate-50">
                  <td className="py-1.5 pr-2">
                    <button type="button" onClick={() => onPickCategory(c.category)} className="text-left font-medium text-slate-800 hover:text-indigo-600">
                      {c.category}
                    </button>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{c.lines.toLocaleString()}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{qtyFmt(c.qty)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-700">{formatCurrency(c.value)}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-slate-600">{data.total ? `${((c.value / data.total) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                <td className="py-2 pr-2">Total</td>
                <td className="py-2 px-2 text-right tabular-nums">{rows.length.toLocaleString()}</td>
                <td className="py-2 px-2 text-right tabular-nums">{qtyFmt(totalQty)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(data.total)}</td>
                <td className="py-2 pl-2 text-right tabular-nums">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className={card}>
        <h2 className="text-sm font-semibold text-slate-900">Product-type mix by {data.byYear ? "year" : "month"}</h2>
        <p className="text-xs text-slate-400 mb-2">Widen the period (From / To) to compare months or years.</p>
        <CategoryTrendChart data={data.trend} categories={data.trendCats} colors={data.colors} />
      </div>
      {showSalesPerson && data.people.length > 1 && (
        <div className={card}>
          <h2 className="text-sm font-semibold text-slate-900">Sales by sales person</h2>
          <p className="text-xs text-slate-400 mb-2">Click a bar to filter the table to that person.</p>
          <CategoryChart data={data.people} onSelect={onPickSalesPerson} />
        </div>
      )}
    </div>
  );
}
