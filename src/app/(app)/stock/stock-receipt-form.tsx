"use client";

import { useActionState, useState } from "react";
import { addStockReceipt, type FormState } from "./actions";
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";
import { formatCurrency } from "@/lib/format";
import { VAT_RATE } from "@/lib/constants";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function StockReceiptForm({ products, today }: { products: SearchableOption[]; today: string }) {
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  // The form's own fields clear after each submit (React resets a form
  // action's inputs); the item picker and other state are reset here.
  const [state, action, isPending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await addStockReceipt(prev, formData);
    if (result.ok) {
      setProductId("");
      setPrice("");
    }
    return result;
  }, {});

  const priceNum = Number(price);

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
          <label className="block text-xs font-medium text-slate-500 mb-1">Qty received</label>
          <input name="quantity" type="number" min={1} step={1} required className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">Date entered stock</label>
          <input name="receivedAt" type="date" defaultValue={today} required className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-start">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">New dealer&apos;s price - basic (optional)</label>
          <input
            name="dealerPrice"
            type="number"
            min={0}
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Excl. VAT"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">
            {priceNum > 0
              ? `Shown to the team as ${formatCurrency(priceNum * (1 + VAT_RATE))} incl. 7.5% VAT`
              : "Leave blank to keep the current price."}
          </p>
        </div>
        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-slate-500 mb-1">Note (optional)</label>
          <input name="note" placeholder="e.g. container / shipment ref." className={inputClass} />
        </div>
        <div className="sm:pt-5">
          <button
            type="submit"
            disabled={isPending || !productId}
            className="w-full rounded-lg bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            {isPending ? "Saving…" : "Add to stock"}
          </button>
        </div>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">Added to stock.</p>}
    </form>
  );
}
