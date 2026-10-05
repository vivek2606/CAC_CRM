"use client";

import { useActionState, useState } from "react";
import { addPendingOrder, type FormState } from "./actions";
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function PendingOrderForm({ products }: { products: (SearchableOption & { availableQty: number | null })[] }) {
  const [productId, setProductId] = useState("");
  // The form's own fields clear after each submit (React resets a form
  // action's inputs); the item picker and other state are reset here.
  const [state, action, isPending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await addPendingOrder(prev, formData);
    if (result.ok) {
      setProductId("");
    }
    return result;
  }, {});
  const selected = products.find((p) => p.id === productId);

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
          {selected && (
            <p className="mt-1 text-xs text-amber-600">
              {selected.availableQty == null ? "Stock not tracked for this item" : `${selected.availableQty} unit(s) in stock now`}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Qty</label>
          <input name="quantity" type="number" min={1} step={1} required className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">Customer</label>
          <input name="customerName" required className={inputClass} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <input name="note" placeholder="Note (optional)" className={`${inputClass} flex-1 min-w-[200px]`} />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="paymentReceived" className="h-4 w-4 rounded border-slate-300" />
          Payment received
        </label>
        <button
          type="submit"
          disabled={isPending || !productId}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {isPending ? "Adding…" : "Add pending order"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
