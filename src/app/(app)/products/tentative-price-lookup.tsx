"use client";

import { useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { formatCurrency } from "@/lib/format";

export type TentativePriceOption = { id: string; label: string; category: string; dealerPrice: number };

// Standalone - has no relation to Product/Pricelist/stock at all. Just an
// item name typed on an upload sheet mapped to a category and tentative
// price, for items that may not exist anywhere else in the system.
export function TentativePriceLookup({ entries }: { entries: TentativePriceOption[] }) {
  const [selectedId, setSelectedId] = useState("");
  const selected = entries.find((e) => e.id === selectedId);

  return (
    <div className="max-w-md">
      <label className="block text-sm font-medium text-slate-700 mb-1">Look up tentative price by item name</label>
      <SearchableSelect
        options={entries}
        value={selectedId}
        onSelect={(opt) => setSelectedId(opt?.id ?? "")}
        placeholder="Type an item name to search..."
        emptyLabel="none"
      />
      {selected && (
        <dl className="mt-3 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Category</dt>
            <dd className="font-medium text-slate-800 mt-0.5">{selected.category}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Tentative Dealer&apos;s Price</dt>
            <dd className="font-medium text-slate-800 mt-0.5">{formatCurrency(selected.dealerPrice)}</dd>
          </div>
        </dl>
      )}
      {selected && (
        <p className="mt-1.5 text-xs text-amber-600">
          Tentative price (excl. 7.5% VAT), independent of current stock - subject to confirmation before quoting.
        </p>
      )}
    </div>
  );
}
