"use client";

import { useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";

type ProductOption = { id: string; code: string; model: string; brand: string };

const PRODUCT_MODES = [
  { value: "existing", label: "Existing product" },
  { value: "new", label: "New product" },
] as const;
type ProductMode = (typeof PRODUCT_MODES)[number]["value"];

export function ProductPriceForm({
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
  };
  submitLabel: string;
}) {
  const [mode, setMode] = useState<ProductMode>(products.length === 0 ? "new" : "existing");
  const [productId, setProductId] = useState(defaultValues?.productId ?? products[0]?.id ?? "");
  const selectedProduct = products.find((p) => p.id === productId);
  const productOptions = products.map((p) => ({ id: p.id, label: `${p.code} — ${p.brand} ${p.model}` }));

  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Product</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {PRODUCT_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === m.value
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="mode" value={mode} />

        {mode === "existing" ? (
          products.length === 0 ? (
            <p className="text-sm text-slate-400">No products yet — switch to &quot;New product&quot; above.</p>
          ) : (
            <>
              <SearchableSelect
                name="productId"
                options={productOptions}
                value={productId}
                onSelect={(opt) => setProductId(opt?.id ?? "")}
                placeholder="Type to search products..."
              />
              {selectedProduct && <p className="text-xs text-slate-400 mt-1">Model: {selectedProduct.model}</p>}
            </>
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Product Code *</label>
              <input
                name="code"
                required
                placeholder="e.g. AC-SPL-1.5T"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Brand *</label>
              <input
                name="brand"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Product Category *</label>
              <input
                name="category"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Product Sub-Category *</label>
              <input
                name="subCategory"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Model *</label>
              <input
                name="model"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Capacity (kW)</label>
              <input
                name="capacityKw"
                type="number"
                step="0.01"
                min={0}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200 pt-5">
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
          <p className="mt-1 text-xs text-slate-400">
            Enter excluding VAT @ 7.5% - the Products page shows this to reps as a VAT-inclusive figure.
          </p>
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
          disabled={mode === "existing" && products.length === 0}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
