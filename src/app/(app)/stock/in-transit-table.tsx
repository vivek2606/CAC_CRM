"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { SortableTh } from "@/components/sortable-th";
import { ExportCsvButton } from "@/components/export-csv-button";
import { InTransitActions } from "./in-transit-actions";

export type InTransitRow = {
  id: string;
  eta: string | null; // YYYY-MM-DD
  orderedAt: string | null;
  model: string;
  code: string;
  category: string;
  tempCode: boolean;
  note: string | null;
  reference: string | null;
  quantity: number;
  receivedQty: number;
  inStock: number | null;
};

type SortKey = "eta" | "model" | "category" | "quantity" | "reference" | "orderedAt" | "inStock";
type ArrivalFilter = "all" | "overdue" | "30" | "60" | "90" | "later" | "unset";

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const control =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function InTransitTable({ rows, today, isHead }: { rows: InTransitRow[]; today: string; isHead: boolean }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [arrival, setArrival] = useState<ArrivalFilter>("all");
  const [stock, setStock] = useState<"all" | "none" | "some">("all");
  const [tempOnly, setTempOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>("eta");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q && ![r.model, r.code, r.reference ?? "", r.note ?? "", r.category].some((v) => v.toLowerCase().includes(q))) return false;
      if (category && r.category !== category) return false;
      if (tempOnly && !r.tempCode) return false;
      if (stock === "none" && (r.inStock ?? 0) > 0) return false;
      if (stock === "some" && (r.inStock ?? 0) <= 0) return false;
      if (arrival !== "all") {
        if (arrival === "unset") return r.eta == null;
        if (r.eta == null) return false;
        if (arrival === "overdue") return r.eta < today;
        if (arrival === "later") return r.eta > addDays(today, 90);
        return r.eta >= today && r.eta <= addDays(today, Number(arrival));
      }
      return true;
    });
    if (!sortKey) return filtered;
    const dir = direction === "asc" ? 1 : -1;
    const val = (r: InTransitRow): string | number | null =>
      sortKey === "quantity" ? r.quantity : sortKey === "inStock" ? (r.inStock ?? 0) : (r[sortKey] ?? null);
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1; // blanks last either way
      if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, query, category, arrival, stock, tempOnly, sortKey, direction, today]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setDirection(direction === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDirection("asc");
    }
  };
  const filtersOn = query !== "" || category !== "" || arrival !== "all" || stock !== "all" || tempOnly;
  const clear = () => {
    setQuery("");
    setCategory("");
    setArrival("all");
    setStock("all");
    setTempOnly(false);
  };
  const units = visible.reduce((s, r) => s + r.quantity, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 px-4 pt-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search model, code, reference, note…"
            aria-label="Search goods in transit"
            className={`${control} w-full pl-9`}
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className={control}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={arrival} onChange={(e) => setArrival(e.target.value as ArrivalFilter)} aria-label="Arrival" className={control}>
          <option value="all">Any arrival</option>
          <option value="overdue">Overdue</option>
          <option value="30">Arriving in 30 days</option>
          <option value="60">Arriving in 60 days</option>
          <option value="90">Arriving in 90 days</option>
          <option value="later">After 90 days</option>
          <option value="unset">Arrival not set</option>
        </select>
        <select value={stock} onChange={(e) => setStock(e.target.value as "all" | "none" | "some")} aria-label="Stock now" className={control}>
          <option value="all">Any stock now</option>
          <option value="none">Out of stock now</option>
          <option value="some">In stock now</option>
        </select>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" checked={tempOnly} onChange={(e) => setTempOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Temporary codes only
        </label>
        {filtersOn && (
          <button type="button" onClick={clear} className="inline-flex items-center gap-1 pb-2 text-sm text-indigo-600 hover:text-indigo-700">
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>
      <div className="flex items-center justify-between px-4 pt-3 text-xs text-slate-500">
        <span>
          {filtersOn ? `Showing ${visible.length} of ${rows.length} lines` : `${rows.length} lines`} · {units} unit{units === 1 ? "" : "s"}
        </span>
        <ExportCsvButton
          filename={`goods-in-transit-${today}.csv`}
          headers={["Tentative arrival", "Model", "Code", "Category", "Qty in transit", "Reference", "Ordered", "In stock now", "Note"]}
          rows={visible.map((r) => [r.eta ?? "", r.model, r.code, r.category, r.quantity, r.reference ?? "", r.orderedAt ?? "", r.inStock ?? 0, r.note ?? ""])}
        />
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">No goods in transit match these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <SortableTh label="Tentative arrival" sortKey="eta" activeKey={sortKey} direction={direction} onSort={onSort} className="whitespace-nowrap px-3! py-2!" />
                <SortableTh label="Item" sortKey="model" activeKey={sortKey} direction={direction} onSort={onSort} className="whitespace-nowrap px-3! py-2!" />
                <SortableTh label="Category" sortKey="category" activeKey={sortKey} direction={direction} onSort={onSort} className="whitespace-nowrap px-3! py-2!" />
                <SortableTh label="Qty in transit" sortKey="quantity" activeKey={sortKey} direction={direction} onSort={onSort} className="text-right whitespace-nowrap px-3! py-2!" />
                <SortableTh label="Reference" sortKey="reference" activeKey={sortKey} direction={direction} onSort={onSort} className="whitespace-nowrap px-3! py-2!" />
                <SortableTh label="Ordered" sortKey="orderedAt" activeKey={sortKey} direction={direction} onSort={onSort} className="whitespace-nowrap px-3! py-2!" />
                <SortableTh label="In stock now" sortKey="inStock" activeKey={sortKey} direction={direction} onSort={onSort} className="text-right whitespace-nowrap px-3! py-2!" />
                {isHead && <th className="px-3 py-2 font-medium" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((o) => {
                const overdue = o.eta != null && o.eta < today;
                return (
                  <tr key={o.id}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {o.eta ? (
                        <span className={overdue ? "text-rose-600 font-medium" : "text-slate-700"}>
                          {fmtDate(o.eta)}
                          {overdue && " (overdue)"}
                        </span>
                      ) : (
                        <span className="text-slate-400">Not set</span>
                      )}
                    </td>
                    <td className="px-3 py-2 min-w-[240px]">
                      <div className="text-slate-800 font-medium">{o.model}</div>
                      <div className="text-[11px] text-slate-400">
                        {o.code}
                        {o.tempCode && (
                          <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            temporary code
                          </span>
                        )}
                      </div>
                      {o.note && <div className="text-[11px] text-slate-500 mt-0.5">{o.note}</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{o.category}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800 tabular-nums">
                      {o.quantity}
                      {o.receivedQty > 0 && <div className="text-[11px] font-normal text-slate-400">{o.receivedQty} already received</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{o.reference ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{o.orderedAt ? fmtDate(o.orderedAt) : "—"}</td>
                    <td className="px-3 py-2 text-right text-slate-600 tabular-nums">{o.inStock ?? "—"}</td>
                    {isHead && (
                      <td className="px-3 py-2">
                        <InTransitActions id={o.id} quantity={o.quantity} today={today} tempCode={o.tempCode} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
