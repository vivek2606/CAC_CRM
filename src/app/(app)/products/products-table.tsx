"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { VAT_RATE } from "@/lib/constants";
import { Trash2, Pencil, ChevronLeft, ChevronRight } from "lucide-react";

export type ProductTableEntry = {
  id: string;
  productId: string;
  productCode: string;
  model: string;
  category: string;
  capacityKw: number | null;
  month: Date;
  dealerPrice: number;
  availableQty: number | null;
};

const PAGE_SIZE = 50;

// Filters entirely client-side as you type/select, same as the Tentative
// Prices table - no submit button, no server round-trip. Pagination is kept
// (this list can genuinely be large), but it now paginates over the
// filtered result set in local state rather than via URL search params.
export function ProductsTable({
  entries,
  isHead,
  deleteAction,
}: {
  entries: ProductTableEntry[];
  isHead: boolean;
  deleteAction: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  const categories = useMemo(() => Array.from(new Set(entries.map((e) => e.category))).sort(), [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (category === "" || e.category === category) &&
        (q === "" || e.productCode.toLowerCase().includes(q) || e.model.toLowerCase().includes(q))
    );
  }, [entries, query, category]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageEntries = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const start = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, filtered.length);

  function updateQuery(v: string) {
    setQuery(v);
    setPage(1);
  }
  function updateCategory(v: string) {
    setCategory(v);
    setPage(1);
  }
  function clear() {
    setQuery("");
    setCategory("");
    setPage(1);
  }

  return (
    <>
      <p className="text-xs text-slate-400">Dealer&apos;s Price shown is inclusive of VAT @ 7.5%.</p>
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="Type a model to filter..."
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={category}
          onChange={(e) => updateCategory(e.target.value)}
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
          <button type="button" onClick={clear} className="text-sm text-slate-500 hover:text-slate-700">
            Clear
          </button>
        )}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            title="No price entries found"
            description={query || category ? "Try a different search or category." : "Add a price entry for a product."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Capacity (kW)</th>
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="px-4 py-3 font-medium">Dealer&apos;s Price</th>
                  <th className="px-4 py-3 font-medium">Quantity</th>
                  {isHead && <th className="px-4 py-3 font-medium" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageEntries.map((entry) => {
                  const boundDelete = deleteAction.bind(null, entry.id);
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        <Link href={`/products/${entry.productId}`} className="hover:text-indigo-600">
                          {entry.model}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{entry.category}</td>
                      <td className="px-4 py-3 text-slate-600">{entry.capacityKw ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric" }).format(entry.month)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatCurrency(entry.dealerPrice * (1 + VAT_RATE))}</td>
                      <td className="px-4 py-3 text-slate-600">{entry.availableQty != null ? entry.availableQty : "—"}</td>
                      {isHead && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <Link
                              href={`/pricelist/${entry.id}/edit`}
                              className="text-slate-400 hover:text-slate-700"
                              aria-label="Edit price entry"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                            <form action={boundDelete}>
                              <button
                                type="submit"
                                className="text-slate-400 hover:text-red-600"
                                aria-label="Delete price entry"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </form>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm">
            <p className="text-slate-500">
              Showing {start}–{end} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className={`inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-600 ${
                  currentPage <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"
                }`}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <span className="text-slate-500 px-1">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className={`inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-600 ${
                  currentPage >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-slate-50"
                }`}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
