"use client";

import { useState } from "react";
import { addDealLineItem } from "./actions";
import { SearchableSelect } from "@/components/searchable-select";
import { formatCurrency } from "@/lib/format";

type ProductOption = { id: string; label: string; defaultPrice: number | null; availableQty: number | null };

export function AddLineItemForm({ dealId, products }: { dealId: string; products: ProductOption[] }) {
  const [productId, setProductId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const action = addDealLineItem.bind(null, dealId);
  const selectedProduct = products.find((p) => p.id === productId);

  function handleProductChange(id: string) {
    setProductId(id);
    const product = products.find((p) => p.id === id);
    if (product?.defaultPrice != null) setUnitPrice(String(product.defaultPrice));
  }

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!productId) {
          e.preventDefault();
          return;
        }
        setProductId("");
        setUnitPrice("");
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div className="flex-1 min-w-[180px]">
        <label className="block text-xs font-medium text-slate-500 mb-1">Product</label>
        <SearchableSelect
          name="productId"
          options={products}
          value={productId}
          onSelect={(opt) => handleProductChange(opt?.id ?? "")}
          placeholder="Type to search models..."
        />
        {selectedProduct && (selectedProduct.defaultPrice != null || selectedProduct.availableQty != null) && (
          <p className="mt-1 text-xs text-amber-600">
            {selectedProduct.defaultPrice != null &&
              `Tentative price: ${formatCurrency(selectedProduct.defaultPrice)} (excl. 7.5% VAT)`}
            {selectedProduct.defaultPrice != null && selectedProduct.availableQty != null && " · "}
            {selectedProduct.availableQty != null && `Approx. ${selectedProduct.availableQty} unit(s) available`}
          </p>
        )}
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
