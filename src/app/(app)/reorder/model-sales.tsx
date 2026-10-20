"use client";

import { useState, useTransition } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { modelSalesHistory, type ModelSalesHistory } from "./actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const qty = (n: number) => (n ? n.toLocaleString("en-NG", { maximumFractionDigits: 2 }) : "-");

// Pick any model: the units sold of that model and type (all its codes
// together - e.g. Atom-B and Atom-C apart) month by month this year and
// last, the 3-month average, and its stock position with the quantity to
// order from Midea.
export function ModelSales({ products, coverMonths }: { products: { id: string; label: string }[]; coverMonths: number }) {
  const [productId, setProductId] = useState("");
  const [h, setH] = useState<ModelSalesHistory | null>(null);
  const [pending, start] = useTransition();

  const pick = (id: string) => {
    setProductId(id);
    setH(null);
    if (id) start(async () => setH(await modelSalesHistory(id, coverMonths)));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-full max-w-xl">
          <SearchableSelect options={products} value={productId} onSelect={(o) => pick(o?.id ?? "")} placeholder="Type a model or code, e.g. MDV-V48 or MVC-730…" />
        </div>
        <a
          href={`/reorder/planning-xlsx?cover=${coverMonths}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
          title="Every model: month-wise sales of this year and last, 3-month average, stock, in transit, pending orders and the order quantity (formulas)"
        >
          Download Midea order plan (Excel, all models)
        </a>
      </div>
      {pending && <p className="text-sm text-slate-500">Loading…</p>}
      {h && (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="font-semibold text-slate-900">{h.model}</span>
              <span className="text-slate-500" title={h.codes.join(", ")}>
                {" "}
                - {h.codes.length} code{h.codes.length === 1 ? "" : "s"}: {h.codes.join(", ")}
              </span>
            </span>
            {h.years.map((y) => (
              <span key={y.year} className="text-slate-700">
                {y.year}: <span className="font-semibold tabular-nums">{qty(y.total)}</span> units
              </span>
            ))}
            <span className="text-slate-700">
              3-month average ({h.avgLabel}): <span className="font-semibold tabular-nums">{h.avg3.toLocaleString("en-NG", { maximumFractionDigits: 1 })}</span> a month
            </span>
            <span className="text-slate-700">
              6-month average ({h.avg6Label}): <span className="font-semibold tabular-nums">{h.avg6.toLocaleString("en-NG", { maximumFractionDigits: 1 })}</span> a month
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-xs uppercase tracking-wide">
                  <th className="px-2 py-1.5 text-left font-medium">Year</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="px-2 py-1.5 text-right font-medium">
                      {m}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {h.years.map((y) => (
                  <tr key={y.year} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-medium text-slate-800">{y.year}</td>
                    {y.months.map((n, i) => (
                      <td key={i} className={`px-2 py-1.5 text-right ${n ? "text-slate-800" : "text-slate-300"}`}>
                        {qty(n)}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-semibold text-slate-900">{qty(y.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              ["In stock", qty(h.stock)],
              ["In transit", `${qty(h.transit)}${h.eta ? ` (ETA ${h.eta.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })})` : ""}`],
              ["Paid pending orders", qty(h.paid)],
              ["Unpaid pending orders", qty(h.unpaid)],
              ["Months of cover", h.monthsCover == null ? "-" : h.monthsCover.toLocaleString("en-NG", { maximumFractionDigits: 1 })],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">{label}</p>
                <p className="text-sm font-semibold text-slate-900 tabular-nums">{value}</p>
              </div>
            ))}
            {(
              [
                ["3-month avg", h.avg3, h.suggested],
                ["6-month avg", h.avg6, h.suggested6],
              ] as const
            ).map(([label, avg, n]) => (
              <div
                key={label}
                className={`rounded-lg px-3 py-2 ${n > 0 ? "bg-amber-100" : "bg-emerald-50"}`}
                title={`${h.coverMonths} months x ${avg} a month + ${h.paid} paid pending - ${h.stock} stock - ${h.transit} in transit`}
              >
                <p className="text-[11px] text-slate-600">
                  Order - {h.coverMonths} months on the {label}
                </p>
                <p className="text-sm font-bold text-slate-900 tabular-nums">{n} units</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
