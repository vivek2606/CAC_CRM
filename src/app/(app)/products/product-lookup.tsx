"use client";

import { useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { formatCurrency } from "@/lib/format";

export type ProductLookupOption = {
  id: string;
  label: string;
  code: string;
  dealerPrice: number | null;
  availableQty: number | null;
};

export function ProductLookup({ products }: { products: ProductLookupOption[] }) {
  const [productId, setProductId] = useState("");
  const selected = products.find((p) => p.id === productId);
  // Confirmed zero on hand - out of stock, plainly.
  const outOfStock = selected != null && selected.availableQty === 0;
  // Never appeared in a Stock & Price List upload at all - could be a
  // legitimately new product not yet counted, or an old/mistyped code
  // that's fallen out of the current catalog. Either way, don't surface a
  // rate we can't stand behind.
  const untracked = selected != null && selected.availableQty == null;
  const showPrice = selected != null && !outOfStock && !untracked && selected.dealerPrice != null;

  return (
    <div className="max-w-md">
      <label className="block text-sm font-medium text-slate-700 mb-1">Look up by model</label>
      <SearchableSelect
        options={products}
        value={productId}
        onSelect={(opt) => setProductId(opt?.id ?? "")}
        placeholder="Type a model to search..."
        emptyLabel="none"
      />
      {selected && (
        <dl className="mt-3 grid grid-cols-3 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Product Code</dt>
            <dd className="font-medium text-slate-800 mt-0.5">{selected.code}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Dealer&apos;s Price</dt>
            <dd className="font-medium text-slate-800 mt-0.5">
              {outOfStock
                ? "Out of stock"
                : untracked
                  ? "Out of stock or model/code obsolete"
                  : showPrice
                    ? formatCurrency(selected.dealerPrice!)
                    : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Quantity in hand</dt>
            <dd className="font-medium text-slate-800 mt-0.5">
              {selected.availableQty != null ? selected.availableQty : "—"}
            </dd>
          </div>
        </dl>
      )}
      {showPrice && (
        <p className="mt-1.5 text-xs text-amber-600">
          Price excludes 7.5% VAT. Quantity is approximate — net of Won deals since the stock was last counted.
        </p>
      )}
    </div>
  );
}
