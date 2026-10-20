"use client";

import { useState, useTransition } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { modelSalesHistory, type ModelSalesHistory } from "./actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const qty = (n: number) => (n ? n.toLocaleString("en-NG", { maximumFractionDigits: 2 }) : "-");

// Pick any model: the units sold of that model and type (all its codes
// together - e.g. Atom-B and Atom-C apart) month by month this year and
// last, with the 3-month average.
export function ModelSales({ products }: { products: { id: string; label: string }[] }) {
  const [productId, setProductId] = useState("");
  const [h, setH] = useState<ModelSalesHistory | null>(null);
  const [pending, start] = useTransition();

  const pick = (id: string) => {
    setProductId(id);
    setH(null);
    if (id) start(async () => setH(await modelSalesHistory(id)));
  };

  return (
    <div className="space-y-3">
      <div className="max-w-xl">
        <SearchableSelect options={products} value={productId} onSelect={(o) => pick(o?.id ?? "")} placeholder="Type a model or code, e.g. MDV-V48 or MVC-730…" />
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
              3-month average ({h.avg3.from}-{h.avg3.to}):{" "}
              <span className="font-semibold tabular-nums">{h.avg3.perMonth.toLocaleString("en-NG", { maximumFractionDigits: 1 })}</span> a month
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
        </>
      )}
    </div>
  );
}
