"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { ExportCsvButton } from "@/components/export-csv-button";
import { CATEGORY_OTHER_COLOR, CATEGORY_PALETTE, MAX_CATEGORY_SLOTS, OTHER_CATEGORY_LABEL } from "@/lib/category-colors";
import { formatAxisCurrency, formatCompactCurrency, formatCurrency } from "@/lib/format";
import type { RegisterRow } from "./register-table";

// Pivot table + pivot chart over the lines the register table is showing
// (its period, sales person, type and column filters): pick the Rows field
// (and an optional second one nested under it), an optional Columns field
// and the Value. The chart draws the first Rows field, stacked by Columns.
// Clicking a row filters the table to it.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type PivotField =
  | "accountName"
  | "accountCode"
  | "salesPerson"
  | "productCode"
  | "product"
  | "category"
  | "company"
  | "invoiceNo"
  | "month"
  | "quarter"
  | "year";
const FIELDS: { key: PivotField; label: string; time?: boolean }[] = [
  { key: "category", label: "Product type" },
  { key: "product", label: "Product" },
  { key: "productCode", label: "Product code" },
  { key: "accountName", label: "Account name" },
  { key: "accountCode", label: "Account code" },
  { key: "salesPerson", label: "Sales person" },
  { key: "company", label: "Company" },
  { key: "invoiceNo", label: "Invoice no." },
  { key: "month", label: "Invoice month", time: true },
  { key: "quarter", label: "Invoice quarter", time: true },
  { key: "year", label: "Invoice year", time: true },
];
type Measure = "amount" | "qty" | "lines" | "invoices";
const MEASURES: { key: Measure; label: string }[] = [
  { key: "amount", label: "Sum of amount (excl. VAT)" },
  { key: "qty", label: "Sum of qty" },
  { key: "lines", label: "Count of lines" },
  { key: "invoices", label: "Count of invoices" },
];
const TOPS = [10, 20, 50, 0] as const;

type Config = { row: PivotField; row2: PivotField | ""; col: PivotField | ""; measure: Measure; top: number };
const DEFAULT: Config = { row: "category", row2: "", col: "", measure: "amount", top: 20 };
const STORE = "cac-register-pivot-v1";

// The value a line has for a field ("2026-09" for its month, etc. - sortable).
const keyOf = (r: RegisterRow, f: PivotField): string => {
  if (f === "month") return r.invoiceDate.slice(0, 7);
  if (f === "year") return r.invoiceDate.slice(0, 4);
  if (f === "quarter") return `${r.invoiceDate.slice(0, 4)}-Q${Math.floor((Number(r.invoiceDate.slice(5, 7)) - 1) / 3) + 1}`;
  return String(r[f] ?? "") || "(blank)";
};
const labelOf = (f: PivotField | "", k: string) => (f === "month" ? `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}` : f === "quarter" ? `${k.slice(5)} ${k.slice(0, 4)}` : k);
const isTime = (f: PivotField | "") => FIELDS.find((x) => x.key === f)?.time ?? false;

// One cell's running totals; invoices are counted distinct.
type Acc = { amount: number; qty: number; lines: number; inv: Set<string> };
const acc = (): Acc => ({ amount: 0, qty: 0, lines: 0, inv: new Set() });
const add = (a: Acc, r: RegisterRow) => {
  a.amount += r.amount;
  a.qty += r.qty;
  a.lines += 1;
  if (r.invoiceNo) a.inv.add(`${r.company}|${r.invoiceNo}`);
};
const valueOf = (a: Acc | undefined, m: Measure) => (!a ? 0 : m === "amount" ? a.amount : m === "qty" ? a.qty : m === "lines" ? a.lines : a.inv.size);

export function RegisterPivot({ rows, showSalesPerson, onPick }: { rows: RegisterRow[]; showSalesPerson: boolean; onPick: (field: PivotField, key: string) => void }) {
  const fields = showSalesPerson ? FIELDS : FIELDS.filter((f) => f.key !== "salesPerson");
  const [cfg, setCfg] = useState<Config>(DEFAULT);
  // The last layout used comes back (this browser only).
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORE) ?? "null") as Partial<Config> | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount (localStorage isn't there on the server)
      if (saved) setCfg((c) => ({ ...c, ...saved }));
    } catch {}
  }, []);
  const set = (patch: Partial<Config>) =>
    setCfg((c) => {
      const next = { ...c, ...patch };
      if (next.row2 === next.row) next.row2 = "";
      if (next.col === next.row || next.col === next.row2) next.col = "";
      try {
        window.localStorage.setItem(STORE, JSON.stringify(next));
      } catch {}
      return next;
    });

  const pivot = useMemo(() => {
    const { row, row2, col, measure } = cfg;
    const byRow = new Map<string, { total: Acc; cells: Map<string, Acc>; subs: Map<string, { total: Acc; cells: Map<string, Acc> }> }>();
    const colTotals = new Map<string, Acc>();
    const grand = acc();
    for (const r of rows) {
      const rk = keyOf(r, row);
      const ck = col ? keyOf(r, col) : "";
      let g = byRow.get(rk);
      if (!g) byRow.set(rk, (g = { total: acc(), cells: new Map(), subs: new Map() }));
      add(g.total, r);
      if (col) {
        if (!g.cells.has(ck)) g.cells.set(ck, acc());
        add(g.cells.get(ck)!, r);
        if (!colTotals.has(ck)) colTotals.set(ck, acc());
        add(colTotals.get(ck)!, r);
      }
      if (row2) {
        const sk = keyOf(r, row2);
        let s = g.subs.get(sk);
        if (!s) g.subs.set(sk, (s = { total: acc(), cells: new Map() }));
        add(s.total, r);
        if (col) {
          if (!s.cells.has(ck)) s.cells.set(ck, acc());
          add(s.cells.get(ck)!, r);
        }
      }
      add(grand, r);
    }
    const v = (a: Acc | undefined) => valueOf(a, measure);
    // Time fields in date order; everything else largest first.
    const order = <T,>(entries: [string, T][], f: PivotField | "", total: (t: T) => number) =>
      isTime(f) ? entries.sort((a, b) => a[0].localeCompare(b[0])) : entries.sort((a, b) => total(b[1]) - total(a[1]) || a[0].localeCompare(b[0]));
    const rowList = order([...byRow.entries()], row, (g) => v(g.total)).map(([k, g]) => ({
      key: k,
      total: g.total,
      cells: g.cells,
      subs: order([...g.subs.entries()], row2, (s) => v(s.total)).map(([sk, s]) => ({ key: sk, ...s })),
    }));
    const colList = order([...colTotals.entries()], col, (a) => v(a)).map(([k]) => k);
    return { rowList, colList, colTotals, grand };
  }, [rows, cfg]);

  const { row, row2, col, measure, top } = cfg;
  const v = (a: Acc | undefined) => valueOf(a, measure);
  const fmt = (n: number) => (measure === "amount" ? formatCurrency(n) : n.toLocaleString("en-NG", { maximumFractionDigits: 2 }));
  const fieldLabel = (f: PivotField | "") => FIELDS.find((x) => x.key === f)?.label ?? "";
  const measureLabel = MEASURES.find((m) => m.key === measure)!.label;

  // Chart: the first Rows field (top N unless it's time), stacked by the
  // Columns field's largest values - the rest fold into "Other".
  const chart = useMemo(() => {
    const time = isTime(row);
    const list = !time && top ? pivot.rowList.slice(0, top) : pivot.rowList;
    const series = col ? pivot.colList.slice(0, MAX_CATEGORY_SLOTS) : [measureLabel];
    const hasOther = col && pivot.colList.length > MAX_CATEGORY_SLOTS;
    const names = hasOther ? [...series, OTHER_CATEGORY_LABEL] : series;
    const data = list.map((g) => {
      const d: Record<string, string | number> = { key: g.key, label: labelOf(row, g.key) };
      if (!col) d[measureLabel] = v(g.total);
      else {
        let rest = v(g.total);
        for (const s of series) {
          const x = v(g.cells.get(s));
          d[labelOf(col, s)] = x;
          rest -= x;
        }
        // Distinct invoice counts don't add across columns - no "Other" then.
        if (hasOther) d[OTHER_CATEGORY_LABEL] = measure === "invoices" ? 0 : rest;
      }
      return d;
    });
    const colors = names.map((_, i) => (hasOther && i === names.length - 1 ? CATEGORY_OTHER_COLOR : CATEGORY_PALETTE[i]));
    return { data, names: names.map((n) => (col && n !== OTHER_CATEGORY_LABEL ? labelOf(col, n) : n)), colors, time, shown: list.length };
  }, [pivot, row, col, measure, top, measureLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows.length === 0) return null;
  const select = "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm";
  const axisFmt = (x: unknown) => (measure === "amount" ? formatAxisCurrency(Number(x)) : Number(x).toLocaleString("en-NG"));
  const tipFmt = (x: unknown) => (measure === "amount" ? formatCompactCurrency(Number(x)) : Number(x).toLocaleString("en-NG", { maximumFractionDigits: 2 }));
  const pick = (k: string) => {
    if (row !== "quarter") onPick(row, k);
  };
  const cols = col ? pivot.colList : [];
  const share = (n: number) => (v(pivot.grand) ? `${((n / v(pivot.grand)) * 100).toFixed(1)}%` : "—");

  // CSV of the pivot table as shown.
  const csvHeaders = [fieldLabel(row), ...(row2 ? [fieldLabel(row2)] : []), ...cols.map((c) => labelOf(col, c)), col ? "Total" : measureLabel];
  const csvRows: (string | number)[][] = [];
  for (const g of pivot.rowList) {
    csvRows.push([labelOf(row, g.key), ...(row2 ? [""] : []), ...cols.map((c) => v(g.cells.get(c))), v(g.total)]);
    for (const s of g.subs) csvRows.push([labelOf(row, g.key), labelOf(row2, s.key), ...cols.map((c) => v(s.cells.get(c))), v(s.total)]);
  }
  csvRows.push(["Grand total", ...(row2 ? [""] : []), ...cols.map((c) => v(pivot.colTotals.get(c))), v(pivot.grand)]);

  const height = chart.time ? 300 : Math.max(220, chart.data.length * 30 + 40);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-2 self-center text-sm font-semibold text-slate-900">Pivot</h2>
        <label className="text-xs font-medium text-slate-500">
          <span className="block mb-1">Rows</span>
          <select value={row} onChange={(e) => set({ row: e.target.value as PivotField })} className={select}>
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          <span className="block mb-1">Then rows by</span>
          <select value={row2} onChange={(e) => set({ row2: e.target.value as PivotField | "" })} className={select}>
            <option value="">—</option>
            {fields
              .filter((f) => f.key !== row)
              .map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          <span className="block mb-1">Columns</span>
          <select value={col} onChange={(e) => set({ col: e.target.value as PivotField | "" })} className={select}>
            <option value="">—</option>
            {fields
              .filter((f) => f.key !== row && f.key !== row2)
              .map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          <span className="block mb-1">Values</span>
          <select value={measure} onChange={(e) => set({ measure: e.target.value as Measure })} className={select}>
            {MEASURES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {!isTime(row) && (
          <label className="text-xs font-medium text-slate-500">
            <span className="block mb-1">Chart shows</span>
            <select value={top} onChange={(e) => set({ top: Number(e.target.value) })} className={select}>
              {TOPS.map((t) => (
                <option key={t} value={t}>
                  {t ? `Top ${t}` : "All"}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" onClick={() => set(DEFAULT)} className="pb-2 text-xs text-slate-500 hover:text-slate-800">
          Reset
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          {measureLabel} by {fieldLabel(row).toLowerCase()}
          {col ? ` and ${fieldLabel(col).toLowerCase()}` : ""}
        </h3>
        <p className="mb-2 text-xs text-slate-400">
          {!chart.time && top && pivot.rowList.length > chart.shown ? `Top ${chart.shown} of ${pivot.rowList.length}. ` : ""}
          {row !== "quarter" ? "Click a bar to filter the table below." : ""}
        </p>
        <ResponsiveContainer width="100%" height={height}>
          {chart.time ? (
            <BarChart data={chart.data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={axisFmt} width={60} />
              <Tooltip formatter={(x, n) => [tipFmt(x), n]} cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13 }} itemStyle={{ color: "#334155" }} />
              {chart.names.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {chart.names.map((n, i) => (
                <Bar
                  key={n}
                  dataKey={n}
                  stackId="s"
                  fill={chart.colors[i]}
                  stroke="#fff"
                  strokeWidth={chart.names.length > 1 ? 2 : 0}
                  radius={i === chart.names.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={40}
                  cursor="pointer"
                  onClick={(e: { payload?: { key?: string } }) => e.payload?.key && pick(e.payload.key)}
                />
              ))}
            </BarChart>
          ) : (
            <BarChart data={chart.data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={axisFmt} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={170} />
              <Tooltip formatter={(x, n) => [tipFmt(x), n]} cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13 }} itemStyle={{ color: "#334155" }} />
              {chart.names.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {chart.names.map((n, i) => (
                <Bar
                  key={n}
                  dataKey={n}
                  stackId="s"
                  fill={chart.colors[i]}
                  stroke="#fff"
                  strokeWidth={chart.names.length > 1 ? 2 : 0}
                  radius={i === chart.names.length - 1 ? [0, 4, 4, 0] : 0}
                  maxBarSize={22}
                  cursor="pointer"
                  onClick={(e: { payload?: { key?: string } }) => e.payload?.key && pick(e.payload.key)}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Pivot table</h3>
          <ExportCsvButton filename="sales-register-pivot.csv" headers={csvHeaders} rows={csvRows} />
        </div>
        <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1.5 font-medium">
                  {fieldLabel(row)}
                  {row2 ? ` / ${fieldLabel(row2)}` : ""}
                </th>
                {cols.map((c) => (
                  <th key={c} className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                    {labelOf(col, c)}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">{col ? "Total" : measureLabel}</th>
                {measure !== "invoices" && <th className="px-2 py-1.5 text-right font-medium">Share</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pivot.rowList.map((g) => (
                <Fragment key={g.key}>
                  <tr className={`hover:bg-slate-50 ${row2 ? "bg-slate-50/60 font-semibold" : ""}`}>
                    <td className="px-2 py-1">
                      <button type="button" onClick={() => pick(g.key)} className="text-left text-slate-800 hover:text-indigo-600">
                        {labelOf(row, g.key)}
                      </button>
                    </td>
                    {cols.map((c) => (
                      <td key={c} className="px-2 py-1 text-right tabular-nums text-slate-700 whitespace-nowrap">
                        {g.cells.get(c) ? fmt(v(g.cells.get(c))) : ""}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap">{fmt(v(g.total))}</td>
                    {measure !== "invoices" && <td className="px-2 py-1 text-right tabular-nums text-slate-500">{share(v(g.total))}</td>}
                  </tr>
                  {g.subs.map((s) => (
                    <tr key={s.key} className="hover:bg-slate-50">
                      <td className="py-1 pl-6 pr-2 text-slate-600">{labelOf(row2, s.key)}</td>
                      {cols.map((c) => (
                        <td key={c} className="px-2 py-1 text-right tabular-nums text-slate-600 whitespace-nowrap">
                          {s.cells.get(c) ? fmt(v(s.cells.get(c))) : ""}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right tabular-nums text-slate-700 whitespace-nowrap">{fmt(v(s.total))}</td>
                      {measure !== "invoices" && <td className="px-2 py-1 text-right tabular-nums text-slate-400">{share(v(s.total))}</td>}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-slate-50">
              <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                <td className="px-2 py-1.5">Grand total</td>
                {cols.map((c) => (
                  <td key={c} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {fmt(v(pivot.colTotals.get(c)))}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmt(v(pivot.grand))}</td>
                {measure !== "invoices" && <td className="px-2 py-1.5 text-right tabular-nums">100%</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
