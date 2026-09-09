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
              {selected.dealerPrice != null ? formatCurrency(selected.dealerPrice) : "—"}
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
      {selected && selected.dealerPrice != null && (
        <p className="mt-1.5 text-xs text-amber-600">
          Price excludes 7.5% VAT. Quantity is approximate — net of Won deals since the stock was last counted.
        </p>
      )}
    </div>
  );
}
