"use client";

import { useEffect, useState } from "react";
import { modelSalesHistory, type ModelSalesHistory } from "./actions";

// Fetched once per product per page visit.
const cache = new Map<string, Promise<ModelSalesHistory | null>>();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const qty = (n: number) => (n ? n.toLocaleString("en-NG", { maximumFractionDigits: 2 }) : "-");

// Under a quote line: units sold of the same model and type (all its codes)
// this year and last - the totals, and month by month on a click.
export function SalesHistory({ productId }: { productId: string }) {
  const [data, setData] = useState<{ id: string; h: ModelSalesHistory | null } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    if (!cache.has(productId)) cache.set(productId, modelSalesHistory(productId).catch(() => null));
    cache.get(productId)!.then((h) => live && setData({ id: productId, h }));
    return () => {
      live = false;
    };
  }, [productId]);
  const h = data?.id === productId ? data.h : null;
  if (!h) return null;

  return (
    <div className="text-[11px] text-slate-600">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-left hover:text-indigo-700" title={`Codes: ${h.codes.join(", ")}`}>
        <span className="font-medium text-slate-700">Sold</span> ({h.model}
        {h.codes.length > 1 ? `, ${h.codes.length} codes` : ""}): {h.years.map((y) => `${y.year}: ${qty(y.total)}`).join(" · ")} ·{" "}
        <span className="font-medium text-slate-700">
          3-month avg ({h.avg3.from}-{h.avg3.to}): {h.avg3.perMonth.toLocaleString("en-NG", { maximumFractionDigits: 1 })}/month
        </span>{" "}
        <span className="text-indigo-600">{open ? "▾ hide" : "▸ month-wise"}</span>
      </button>
      {open && (
        <div className="mt-1 overflow-x-auto">
          <table className="text-[11px] tabular-nums" data-own-head>
            <thead>
              <tr className="text-slate-400">
                <th className="pr-2 text-left font-medium" />
                {MONTHS.map((m) => (
                  <th key={m} className="px-1 text-right font-medium">
                    {m}
                  </th>
                ))}
                <th className="pl-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {h.years.map((y) => (
                <tr key={y.year}>
                  <td className="pr-2 font-medium text-slate-700">{y.year}</td>
                  {y.months.map((n, i) => (
                    <td key={i} className={`px-1 text-right ${n ? "text-slate-800" : "text-slate-300"}`}>
                      {qty(n)}
                    </td>
                  ))}
                  <td className="pl-2 text-right font-semibold text-slate-800">{qty(y.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
