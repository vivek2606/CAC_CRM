"use client";

import { useState } from "react";
import { Card, EmptyState } from "@/components/ui";
import { formatCurrency } from "@/lib/format";

type Entry = { model: string; category: string; dealerPrice: number };

// Filters entirely client-side as you type/select - no submit button, no
// server round-trip. The dataset here is small (a curated list of items not
// currently in stock), so holding it all in the browser and filtering live
// is simpler and faster than a server-driven form.
export function TentativePriceTable({ entries }: { entries: Entry[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const categories = Array.from(new Set(entries.map((e) => e.category))).sort();

  const filtered = entries.filter(
    (e) =>
      (category === "" || e.category === category) &&
      (query.trim() === "" || e.model.toLowerCase().includes(query.trim().toLowerCase()))
  );

  return (
    <>
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a model to filter..."
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {(query || category) && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("");
            }}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            title="No tentative prices found"
            description={
              query || category ? "Try a different model or category." : "Check back once some have been added."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Tentative Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((entry) => (
                  <tr key={entry.model} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{entry.model}</td>
                    <td className="px-4 py-3 text-slate-500">{entry.category}</td>
                    <td className="px-4 py-3 text-slate-700">{formatCurrency(entry.dealerPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
