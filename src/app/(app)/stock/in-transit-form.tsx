"use client";

import { useActionState, useState } from "react";
import { addInTransit, importInTransit, type FormState, type BulkInTransitState } from "./actions";
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function InTransitForm({ products }: { products: SearchableOption[] }) {
  const [productId, setProductId] = useState("");
  const [state, action, isPending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await addInTransit(prev, formData);
    if (result.ok) setProductId("");
    return result;
  }, {});

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-slate-500 mb-1">Item</label>
          <SearchableSelect
            name="productId"
            options={products}
            value={productId}
            onSelect={(o) => setProductId(o?.id ?? "")}
            placeholder="Type to search models..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Qty</label>
          <input name="quantity" type="number" min={1} step={1} required className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">Tentative arrival (ETA)</label>
          <input name="eta" type="date" className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">Order date (optional)</label>
          <input name="orderedAt" type="date" className={inputClass} />
        </div>
        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-slate-500 mb-1">Reference (optional)</label>
          <input name="reference" placeholder="PI / PO / container no." className={inputClass} />
        </div>
        <button
          type="submit"
          disabled={isPending || !productId}
          className="rounded-lg bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {isPending ? "Saving…" : "Add in transit"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">Added to goods in transit.</p>}
    </form>
  );
}

export function BulkInTransitForm() {
  const [state, action, isPending] = useActionState<BulkInTransitState, FormData>(importInTransit, {});
  const s = state.summary;
  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Excel file</label>
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:px-4 file:py-2 file:text-sm file:font-medium file:cursor-pointer"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {isPending ? "Uploading…" : "Upload"}
        </button>
        <a href="/stock/in-transit-template" className="text-sm text-indigo-600 hover:text-indigo-700 pb-2">
          Download template
        </a>
      </form>
      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{state.error}</p>
      )}
      {s && (
        <div className="rounded-lg border border-slate-200 p-4 space-y-2 text-sm">
          <p className="text-slate-800">
            <span className="font-semibold">{s.added}</span> line{s.added === 1 ? "" : "s"} added ({s.units} unit
            {s.units === 1 ? "" : "s"}) from {s.rowsRead} row{s.rowsRead === 1 ? "" : "s"}.
          </p>
          {s.alreadyRecorded > 0 && (
            <p className="text-slate-500">
              Skipped {s.alreadyRecorded} row{s.alreadyRecorded === 1 ? "" : "s"} already in transit (same item, quantity, ETA
              and reference).
            </p>
          )}
          {s.productsCreated.length > 0 && <p className="text-slate-500">New products created: {s.productsCreated.join(", ")}</p>}
          {s.problems.length > 0 && (
            <div>
              <p className="font-medium text-amber-700">
                {s.problems.length} row{s.problems.length === 1 ? "" : "s"} not imported - fix and upload again:
              </p>
              <ul className="mt-1 list-disc list-inside text-amber-700 space-y-0.5">
                {s.problems.slice(0, 30).map((p) => (
                  <li key={p.rowNumber}>
                    Row {p.rowNumber}: {p.problem}
                  </li>
                ))}
                {s.problems.length > 30 && <li>…and {s.problems.length - 30} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
