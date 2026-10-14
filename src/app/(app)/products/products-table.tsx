"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown, Pencil, Trash2, X } from "lucide-react";
import { ExportCsvButton } from "@/components/export-csv-button";
import { VAT_RATE } from "@/lib/constants";

export type ProductTableEntry = {
  id: string;
  productId: string;
  productCode: string;
  model: string;
  category: string;
  capacityKw: number | null;
  month: Date;
  dealerPrice: number;
  maxDiscountPct: number | null;
  availableQty: number | null;
};

// Same as the Sales Register table: sort by any column, a filter box under
// each heading ("=Exact" to match exactly, ">1000" / "<5" on numbers), CSV
// of what's shown. Each product's latest price by default; "All months"
// shows its earlier price entries too.

type Row = {
  id: string;
  productId: string;
  productCode: string;
  model: string;
  category: string;
  capacityKw: number | null;
  month: string; // YYYY-MM
  priceExVat: number;
  priceIncVat: number;
  maxDiscountPct: number | null;
  availableQty: number | null;
};
type Key = Exclude<keyof Row, "id" | "productId">;
const COLUMNS: { key: Key; label: string; numeric?: boolean; width?: string }[] = [
  { key: "productCode", label: "Product code" },
  { key: "model", label: "Model", width: "max-w-[220px]" },
  { key: "category", label: "Category" },
  { key: "capacityKw", label: "Capacity (kW)", numeric: true },
  { key: "month", label: "Price month" },
  { key: "priceExVat", label: "Dealer's price ex-VAT", numeric: true },
  { key: "priceIncVat", label: `Incl. VAT @ ${VAT_RATE * 100}%`, numeric: true },
  { key: "maxDiscountPct", label: "Max disc. %", numeric: true },
  { key: "availableQty", label: "Quantity", numeric: true },
];

const money = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const display = (r: Row, k: Key): string => {
  const v = r[k];
  if (v == null) return "—";
  if (k === "priceExVat" || k === "priceIncVat") return money(v as number);
  if (k === "maxDiscountPct") return `${v}%`;
  if (k === "month") return monthLabel(v as string);
  return String(v);
};

export function ProductsTable({
  entries,
  isHead,
  deleteAction,
}: {
  entries: ProductTableEntry[];
  isHead: boolean;
  deleteAction: (id: string) => Promise<void>;
}) {
  // The max discount % is shown to the Head only.
  const COLS = isHead ? COLUMNS : COLUMNS.filter((c) => c.key !== "maxDiscountPct");
  const [allMonths, setAllMonths] = useState(false);
  const [filters, setFilters] = useState<Partial<Record<Key, string>>>({});
  const [sortKey, setSortKey] = useState<Key>("model");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const rows = useMemo(() => {
    // entries come newest month first: the first per product is its latest.
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const e of entries) {
      if (!allMonths && seen.has(e.productId)) continue;
      seen.add(e.productId);
      const m = new Date(e.month);
      out.push({
        id: e.id,
        productId: e.productId,
        productCode: e.productCode,
        model: e.model,
        category: e.category,
        capacityKw: e.capacityKw,
        month: `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`,
        priceExVat: e.dealerPrice,
        priceIncVat: Math.round(e.dealerPrice * (1 + VAT_RATE) * 100) / 100,
        maxDiscountPct: e.maxDiscountPct,
        availableQty: e.availableQty,
      });
    }
    return out;
  }, [entries, allMonths]);

  const visible = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v && v.trim()) as [Key, string][];
    const filtered = rows.filter((r) =>
      active.every(([k, v]) => {
        const q = v.trim().toLowerCase();
        if (q.startsWith("=")) return display(r, k).toLowerCase() === q.slice(1).trim() || String(r[k] ?? "").toLowerCase() === q.slice(1).trim();
        const col = COLUMNS.find((c) => c.key === k);
        if (col?.numeric && /^[<>]=?\s*-?[\d,.]+$/.test(q)) {
          const x = r[k] as number | null;
          if (x == null) return false;
          const n = Number(q.replace(/[<>=,\s]/g, ""));
          return q.startsWith(">=") ? x >= n : q.startsWith("<=") ? x <= n : q.startsWith(">") ? x > n : x < n;
        }
        return display(r, k).toLowerCase().includes(q) || String(r[k] ?? "").toLowerCase().includes(q);
      }),
    );
    const m = dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const x = a[sortKey];
      const y = b[sortKey];
      // Blanks last either way.
      if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * m;
    });
  }, [rows, filters, sortKey, dir]);

  const sortBy = (k: Key) => {
    if (k === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setDir(COLUMNS.find((c) => c.key === k)?.numeric || k === "month" ? "desc" : "asc");
    }
  };
  const anyFilter = Object.values(filters).some((v) => v && v.trim());
  const totalQty = visible.reduce((s, r) => s + (r.availableQty ?? 0), 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{visible.length.toLocaleString()}</span> {allMonths ? "price entr" + (visible.length === 1 ? "y" : "ies") : "product" + (visible.length === 1 ? "" : "s")}
          {anyFilter && ` of ${rows.length.toLocaleString()}`} · In stock <span className="font-semibold text-slate-900">{totalQty.toLocaleString()}</span>
        </p>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={allMonths} onChange={(e) => setAllMonths(e.target.checked)} className="rounded border-slate-300" />
          All months (earlier prices too)
        </label>
        {anyFilter && (
          <button type="button" onClick={() => setFilters({})} className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700">
            <X className="h-3.5 w-3.5" />
            Clear column filters
          </button>
        )}
        <div className="ml-auto">
          <ExportCsvButton
            filename="products.csv"
            headers={COLS.map((c) => c.label)}
            rows={visible.map((r) => COLS.map((c) => (c.key === "month" ? r.month : (r[c.key] ?? "") as string | number)))}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
              {COLS.map((c) => (
                <th key={c.key} className={`px-2 py-1.5 font-medium whitespace-nowrap ${c.numeric ? "text-right" : ""}`}>
                  <button type="button" onClick={() => sortBy(c.key)} className="inline-flex items-center gap-1 hover:text-slate-800">
                    {c.label}
                    {sortKey === c.key ? dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                  </button>
                </th>
              ))}
              {isHead && <th className="px-2 py-1.5" />}
            </tr>
            <tr className="border-b border-slate-200 bg-white">
              {COLS.map((c) => (
                <th key={c.key} className="px-1 py-1">
                  <input
                    value={filters[c.key] ?? ""}
                    onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })}
                    placeholder={c.numeric ? ">1000" : "Filter…"}
                    title={c.numeric ? "Type a value, or >1000 / <5" : "Type to match, or =Exact"}
                    aria-label={`Filter ${c.label}`}
                    className={`w-full min-w-[60px] rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case focus:outline-none focus:ring-1 focus:ring-indigo-500 ${c.numeric ? "text-right" : ""}`}
                  />
                </th>
              ))}
              {isHead && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.length === 0 && (
              <tr>
                <td colSpan={COLS.length + (isHead ? 1 : 0)} className="px-3 py-10 text-center text-sm text-slate-500">
                  {anyFilter ? "No products match these filters." : "No products with a price yet."}
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                {COLS.map((c) => (
                  <td key={c.key} className={`px-2 py-1.5 whitespace-nowrap ${c.width ?? ""} ${c.numeric ? "text-right tabular-nums" : ""} ${c.key === "model" ? "font-medium" : "text-slate-600"}`}>
                    <div className={c.width ? "truncate" : ""} title={c.width ? display(r, c.key) : undefined}>
                      {c.key === "model" ? (
                        <Link href={`/products/${r.productId}`} className="text-slate-800 hover:text-indigo-600">
                          {r.model}
                        </Link>
                      ) : (
                        display(r, c.key)
                      )}
                    </div>
                  </td>
                ))}
                {isHead && (
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/pricelist/${r.id}/edit`} className="text-slate-400 hover:text-slate-700" aria-label="Edit price entry">
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <form action={deleteAction.bind(null, r.id)}>
                        <button type="submit" className="text-slate-400 hover:text-red-600" aria-label="Delete price entry">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
