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
  tentativePrice: number | null;
};

export function ProductLookup({ products }: { products: ProductLookupOption[] }) {
  const [productId, setProductId] = useState("");
  const selected = products.find((p) => p.id === productId);
  // Confirmed zero on hand, or never appeared in a Stock & Price List
  // upload at all - either way, nothing to sell from stock right now.
  const noStock = selected != null && (selected.availableQty === 0 || selected.availableQty == null);
  const showPrice = selected != null && !noStock && selected.dealerPrice != null;
  const showTentative = selected != null && noStock && selected.tentativePrice != null;

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
              {showTentative
                ? `${formatCurrency(selected.tentativePrice!)} (tentative)`
                : showPrice
                  ? formatCurrency(selected.dealerPrice!)
                  : selected.availableQty === 0
                    ? "Out of stock"
                    : "Out of stock or model/code obsolete"}
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
      {showTentative && (
        <p className="mt-1.5 text-xs text-amber-600">
          None currently in stock — this is a tentative price (excl. 7.5% VAT), subject to confirmation before
          quoting.
        </p>
      )}
    </div>
  );
}
