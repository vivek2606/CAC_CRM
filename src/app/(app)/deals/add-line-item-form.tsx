"use client";

import { useState } from "react";
import { addDealLineItem } from "./actions";

type ProductOption = { id: string; label: string; defaultPrice: number | null };

export function AddLineItemForm({ dealId, products }: { dealId: string; products: ProductOption[] }) {
  const [productId, setProductId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const action = addDealLineItem.bind(null, dealId);

  function handleProductChange(id: string) {
    setProductId(id);
    const product = products.find((p) => p.id === id);
    if (product?.defaultPrice != null) setUnitPrice(String(product.defaultPrice));
  }

  return (
    <form
      action={action}
      onSubmit={() => {
        setProductId("");
        setUnitPrice("");
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div className="flex-1 min-w-[180px]">
        <label className="block text-xs font-medium text-slate-500 mb-1">Product</label>
        <select
          name="productId"
          required
          value={productId}
          onChange={(e) => handleProductChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="" disabled>
            Choose a product...
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="w-20">
        <label className="block text-xs font-medium text-slate-500 mb-1">Qty</label>
        <input
          name="qty"
          type="number"
          min={0}
          step="any"
          required
          defaultValue={1}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div className="w-32">
        <label className="block text-xs font-medium text-slate-500 mb-1">Unit price (₦)</label>
        <input
          name="unitPrice"
          type="number"
          min={0}
          step="any"
          required
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <button
        type="submit"
        className="rounded-lg bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 transition-colors"
      >
        Add
      </button>
    </form>
  );
}
