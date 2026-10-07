"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown, X } from "lucide-react";
import { ExportCsvButton } from "@/components/export-csv-button";
import { RegisterCharts } from "./register-charts";

export type RegisterRow = {
  id: string;
  accountName: string;
  accountCode: string;
  salesPerson: string;
  productCode: string;
  product: string;
  category: string;
  qty: number;
  rate: number; // excl. VAT
  amount: number;
  invoiceNo: string;
  invoiceDate: string; // YYYY-MM-DD
  dealId: string | null;
};

type Key = Exclude<keyof RegisterRow, "id" | "dealId">;
const COLUMNS: { key: Key; label: string; numeric?: boolean; width?: string }[] = [
  { key: "accountName", label: "Account name", width: "max-w-[140px]" },
  { key: "accountCode", label: "Account code" },
  { key: "salesPerson", label: "Sales person", width: "max-w-[105px]" },
  { key: "productCode", label: "Product code" },
  { key: "product", label: "Product", width: "max-w-[160px]" },
  { key: "category", label: "Product type", width: "max-w-[85px]" },
  { key: "qty", label: "Qty", numeric: true },
  { key: "rate", label: "Rate ex-VAT", numeric: true },
  { key: "amount", label: "Amount", numeric: true },
  { key: "invoiceNo", label: "Invoice no." },
  { key: "invoiceDate", label: "Invoice date" },
];

const money = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const display = (r: RegisterRow, k: Key) =>
  k === "rate" || k === "amount" ? money(r[k]) : k === "qty" ? String(r.qty) : k === "invoiceDate" ? fmtDate(r.invoiceDate) : String(r[k] ?? "");
const PAGE = 500;

export function SalesRegisterTable({ rows, filename, showSalesPerson }: { rows: RegisterRow[]; filename: string; showSalesPerson: boolean }) {
  const columns = showSalesPerson ? COLUMNS : COLUMNS.filter((c) => c.key !== "salesPerson");
  const [filters, setFilters] = useState<Partial<Record<Key, string>>>({});
  const [sortKey, setSortKey] = useState<Key>("invoiceDate");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [shown, setShown] = useState(PAGE);

  const visible = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v && v.trim()) as [Key, string][];
    const filtered = rows.filter((r) =>
      active.every(([k, v]) => {
        const q = v.trim().toLowerCase();
        // "=Duct" matches exactly (so it doesn't also catch "Large Duct").
        if (q.startsWith("=")) return String(r[k]).toLowerCase() === q.slice(1).trim();
        // Numbers: ">1000", "<5", or plain text match on the shown value.
        const col = COLUMNS.find((c) => c.key === k);
        if (col?.numeric && /^[<>]=?\s*-?[\d,.]+$/.test(q)) {
          const n = Number(q.replace(/[<>=,\s]/g, ""));
          const x = r[k] as number;
          return q.startsWith(">=") ? x >= n : q.startsWith("<=") ? x <= n : q.startsWith(">") ? x > n : x < n;
        }
        return display(r, k).toLowerCase().includes(q) || String(r[k]).toLowerCase().includes(q);
      }),
    );
    const m = dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const x = a[sortKey];
      const y = b[sortKey];
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * m;
    });
  }, [rows, filters, sortKey, dir]);

  const totals = useMemo(
    () => ({ qty: visible.reduce((s, r) => s + r.qty, 0), amount: visible.reduce((s, r) => s + r.amount, 0), invoices: new Set(visible.map((r) => r.invoiceNo).filter(Boolean)).size }),
    [visible],
  );
  const sortBy = (k: Key) => {
    if (k === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setDir(COLUMNS.find((c) => c.key === k)?.numeric || k === "invoiceDate" ? "desc" : "asc");
    }
  };
  const anyFilter = Object.values(filters).some((v) => v && v.trim());
  const [showCharts, setShowCharts] = useState(true);
  const pick = (k: Key) => (value: string) => {
    setFilters((f) => ({ ...f, [k]: `=${value}` }));
    setShown(PAGE);
  };

  return (
    <div className="space-y-3">
    <div className="flex justify-end">
      <button type="button" onClick={() => setShowCharts(!showCharts)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
        {showCharts ? "Hide charts" : "Show charts"}
      </button>
    </div>
    {showCharts && (
      <RegisterCharts rows={visible} showSalesPerson={showSalesPerson} onPickCategory={pick("category")} onPickSalesPerson={pick("salesPerson")} />
    )}
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{visible.length.toLocaleString()}</span> line{visible.length === 1 ? "" : "s"}
          {anyFilter && ` of ${rows.length.toLocaleString()}`} · {totals.invoices.toLocaleString()} invoice{totals.invoices === 1 ? "" : "s"} · Qty{" "}
          <span className="font-semibold text-slate-900">{totals.qty.toLocaleString("en-NG", { maximumFractionDigits: 2 })}</span> · Amount{" "}
          <span className="font-semibold text-slate-900">₦{money(totals.amount)}</span>
        </p>
        {anyFilter && (
          <button type="button" onClick={() => setFilters({})} className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700">
            <X className="h-3.5 w-3.5" />
            Clear column filters
          </button>
        )}
        <div className="ml-auto">
          <ExportCsvButton
            filename={filename}
            headers={columns.map((c) => (c.key === "rate" ? "Rate (excl. VAT)" : c.label))}
            rows={visible.map((r) => columns.map((c) => (c.numeric ? (r[c.key] as number) : String(r[c.key] ?? ""))))}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
              {columns.map((c) => (
                <th key={c.key} className={`px-1.5 py-1.5 font-medium whitespace-nowrap ${c.numeric ? "text-right" : ""}`}>
                  <button type="button" onClick={() => sortBy(c.key)} className="inline-flex items-center gap-1 hover:text-slate-800">
                    {c.label}
                    {sortKey === c.key ? dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                  </button>
                </th>
              ))}
            </tr>
            <tr className="border-b border-slate-200 bg-white">
              {columns.map((c) => (
                <th key={c.key} className="px-1 py-1">
                  <input
                    value={filters[c.key] ?? ""}
                    onChange={(e) => {
                      setFilters({ ...filters, [c.key]: e.target.value });
                      setShown(PAGE);
                    }}
                    placeholder={c.numeric ? ">1000" : "Filter…"}
                    title={c.numeric ? "Type a value, or >1000 / <5" : "Type to match, or =Exact"}
                    aria-label={`Filter ${c.label}`}
                    className={`w-full min-w-[48px] rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-normal normal-case focus:outline-none focus:ring-1 focus:ring-indigo-500 ${c.numeric ? "text-right" : ""}`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-slate-500">
                  No sales lines for these filters.
                </td>
              </tr>
            )}
            {visible.slice(0, shown).map((r) => (
              <tr key={r.id} className={`hover:bg-slate-50 ${r.amount < 0 ? "text-rose-700" : "text-slate-700"}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-1.5 py-1 whitespace-nowrap ${c.width ?? ""} ${c.numeric ? "text-right tabular-nums" : ""}`}>
                    {/* Long text stays on one line; the full text shows on hover. */}
                    <div className={c.width ? "truncate" : ""} title={c.width ? display(r, c.key) : undefined}>
                      {c.key === "accountName" && r.dealId ? (
                        <Link
                          // A won deal with no products opens straight on its invoices & products.
                          href={r.category === "No products listed" ? `/deals/${r.dealId}?markWon=1` : `/deals/${r.dealId}`}
                          className="text-indigo-700 hover:underline"
                        >
                          {r.accountName}
                        </Link>
                      ) : (
                        display(r, c.key)
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {visible.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                {columns.map((c, i) => (
                  <td key={c.key} className={`px-1.5 py-1.5 ${c.numeric ? "text-right tabular-nums" : ""}`}>
                    {i === 0 ? "Total" : c.key === "qty" ? totals.qty.toLocaleString("en-NG", { maximumFractionDigits: 2 }) : c.key === "amount" ? money(totals.amount) : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {visible.length > shown && (
        <div className="border-t border-slate-100 p-3 text-center">
          <button type="button" onClick={() => setShown(shown + PAGE)} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            Show {Math.min(PAGE, visible.length - shown)} more of {(visible.length - shown).toLocaleString()} remaining
          </button>
        </div>
      )}
    </div>
    </div>
  );
}

// Period picker: choosing a month fills From/To with that month's dates.
export function PeriodFields({ from, to }: { from: string; to: string }) {
  const [range, setRange] = useState({ from, to });
  const input = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
        <input
          type="month"
          value={range.from.slice(0, 7) === range.to.slice(0, 7) ? range.from.slice(0, 7) : ""}
          onChange={(e) => {
            const m = e.target.value.match(/^(\d{4})-(\d{2})$/);
            if (!m) return;
            const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
            setRange({ from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}` });
          }}
          className={input}
        />
      </div>
      <span className="pb-2 text-xs text-slate-400">or dates</span>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
        <input type="date" name="from" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className={input} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
        <input type="date" name="to" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className={input} />
      </div>
    </>
  );
}
