"use client";

import { useState, useTransition } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { modelSalesHistory } from "./actions";
import type { ModelForecast } from "@/lib/model-forecast";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const qty = (n: number) => (n ? n.toLocaleString("en-NG", { maximumFractionDigits: 1 }) : "-");

// Pick any model: its Midea order plan - stock now, goods in transit, paid
// pending orders, projected sales until the order lands and the stock left
// then, projected sales for the months the order covers, the quantity to
// order - and its sales month by month over the last few years.
export function ModelSales({ products, settings }: { products: { id: string; label: string }[]; settings: { arrive: string; g: string; gr: string; go: string } }) {
  const [productId, setProductId] = useState("");
  const [f, setF] = useState<ModelForecast | null>(null);
  const [pending, start] = useTransition();
  const pick = (id: string) => {
    setProductId(id);
    setF(null);
    if (id) start(async () => setF(await modelSalesHistory(id, settings)));
  };
  const box = "rounded-lg bg-slate-50 px-3 py-2";
  const q = new URLSearchParams(settings).toString();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-full max-w-xl">
          <SearchableSelect options={products} value={productId} onSelect={(o) => pick(o?.id ?? "")} placeholder="Type a model or code, e.g. MDV-V48 or MVC-730…" />
        </div>
        <a
          href={`/reorder/planning-xlsx?${q}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
          title="Every model: stock, in transit, projected sales month by month, stock at landing and the order quantity (formulas), plus the sales history"
        >
          Download Midea order plan (Excel, all models)
        </a>
      </div>
      {pending && <p className="text-sm text-slate-500">Loading…</p>}
      {f && (
        <>
          <p className="text-sm">
            <span className="font-semibold text-slate-900">{f.model}</span>
            <span className="text-slate-500">
              {" "}
              - {f.category} - {f.codes.length} code{f.codes.length === 1 ? "" : "s"}: {f.codes.join(", ")}
            </span>
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${f.growthGroup === "Other" ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-800"}`}>
              {f.growthGroup === "Driver" ? "Growth driver" : f.growthGroup} +{f.growthPct}% next year
            </span>
          </p>

          {/* 1. Stock position now */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className={box}>
              <p className="text-[11px] text-slate-500">Stock now</p>
              <p className="text-sm font-semibold tabular-nums">{qty(f.stock)}</p>
            </div>
            <div className={box}>
              <p className="text-[11px] text-slate-500">In transit (Nov-Dec)</p>
              <p className="text-sm font-semibold tabular-nums">
                {qty(f.transit)}
                {f.eta ? <span className="font-normal text-slate-500"> - ETA {new Date(f.eta).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })}</span> : null}
              </p>
            </div>
            <div className={box}>
              <p className="text-[11px] text-slate-500">Paid pending orders (owed)</p>
              <p className="text-sm font-semibold tabular-nums">{qty(f.paid)}</p>
            </div>
            <div className={box}>
              <p className="text-[11px] text-slate-500">Unpaid pending orders (info)</p>
              <p className="text-sm font-semibold tabular-nums">{qty(f.unpaid)}</p>
            </div>
          </div>

          {/* 2-3. Until the order lands, then the months it covers */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-xs uppercase tracking-wide">
                  <th className="px-2 py-1.5 text-left font-medium">Projected sales</th>
                  {[...f.before, ...f.after].map((m) => (
                    <th key={m.key} className={`px-2 py-1.5 text-right font-medium ${f.after.includes(m) ? "bg-amber-50" : ""}`}>
                      {m.label}
                      {m.growth ? " *" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100">
                  <td className="px-2 py-1.5 text-slate-600">Units</td>
                  {[...f.before, ...f.after].map((m) => (
                    <td key={m.key} className={`px-2 py-1.5 text-right ${f.after.includes(m) ? "bg-amber-50" : ""}`}>
                      {qty(m.qty)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-slate-500">
              Each month: the same month&apos;s average over the last 3 years the model sold in; * next year&apos;s months +{f.growthPct}% growth.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className={`rounded-lg px-3 py-2 ${f.stockAtArrival < 0 ? "bg-rose-50" : "bg-indigo-50"}`}>
              <p className="text-[11px] text-slate-600">Stock left when the order lands (start {f.after[0]?.label})</p>
              <p className="text-sm font-bold tabular-nums">{qty(f.stockAtArrival) === "-" ? "0" : qty(f.stockAtArrival)}</p>
              <p className="text-[11px] text-slate-500">
                {qty(f.stock)} + {qty(f.transit)} in transit - {qty(f.paid)} paid pending - {qty(f.soldBefore)} sales until then
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 px-3 py-2">
              <p className="text-[11px] text-slate-600">
                Sales to cover {f.after[0]?.label}-{f.after[f.after.length - 1]?.label}
              </p>
              <p className="text-sm font-bold tabular-nums">{qty(f.needAfter) === "-" ? "0" : qty(f.needAfter)}</p>
            </div>
            <div className={`rounded-lg px-3 py-2 ${f.order > 0 ? "bg-amber-200" : "bg-emerald-50"}`}>
              <p className="text-[11px] font-medium text-slate-700">ORDER NOW (lands {f.after[0]?.label})</p>
              <p className="text-lg font-bold tabular-nums">{f.order} units</p>
              {f.shortBefore > 0 && <p className="text-[11px] font-medium text-rose-700">Short by {f.shortBefore} before it lands - stock runs out first.</p>}
            </div>
          </div>

          {/* Sales history */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-xs uppercase tracking-wide">
                  <th className="px-2 py-1.5 text-left font-medium">Sold</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="px-2 py-1.5 text-right font-medium">
                      {m}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {f.history.map((y) => (
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
        </>
      )}
    </div>
  );
}
