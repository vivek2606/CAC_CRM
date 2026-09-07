"use client";

import { useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";

type ProductOption = { id: string; code: string; model: string; brand: string };

export function PricelistForm({
  action,
  products,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  products: ProductOption[];
  defaultValues?: {
    productId?: string;
    month?: string; // "YYYY-MM"
    dealerPrice?: number;
    landedPrice?: number | null;
    exchangeRate?: number;
  };
  submitLabel: string;
}) {
  const [productId, setProductId] = useState(defaultValues?.productId ?? products[0]?.id ?? "");
  const selectedProduct = products.find((p) => p.id === productId);
  const productOptions = products.map((p) => ({ id: p.id, label: `${p.code} — ${p.brand} ${p.model}` }));

  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Product Code *</label>
          {products.length === 0 ? (
            <p className="text-sm text-slate-400">No products yet</p>
          ) : (
            <SearchableSelect
              name="productId"
              options={productOptions}
              value={productId}
              onSelect={(opt) => setProductId(opt?.id ?? "")}
              placeholder="Type to search products..."
            />
          )}
          {selectedProduct && (
            <p className="text-xs text-slate-400 mt-1">Model: {selectedProduct.model}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Month *</label>
          <input
            name="month"
            type="month"
            required
            defaultValue={defaultValues?.month}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Exchange Rate (₦ to $1) *</label>
          <input
            name="exchangeRate"
            type="number"
            step="0.01"
            min={0}
            required
            defaultValue={defaultValues?.exchangeRate}
            placeholder="e.g. 1550.00"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Dealer&apos;s Price (₦) *</label>
          <input
            name="dealerPrice"
            type="number"
            step="0.01"
            min={0}
            required
            defaultValue={defaultValues?.dealerPrice}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Landed Price (₦)</label>
          <input
            name="landedPrice"
            type="number"
            step="0.01"
            min={0}
            defaultValue={defaultValues?.landedPrice ?? undefined}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={products.length === 0}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
