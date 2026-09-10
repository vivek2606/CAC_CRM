import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { getAllTentativePrices } from "@/lib/pricing";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { TentativePriceLookup } from "../tentative-price-lookup";

export default async function TentativePricesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  const entries = await getAllTentativePrices();
  const lookupOptions = entries.map((e) => ({
    id: e.model,
    label: e.model,
    category: e.category,
    dealerPrice: e.dealerPrice,
  }));
  const categories = Array.from(new Set(entries.map((e) => e.category))).sort();
  const filteredEntries = params.category ? entries.filter((e) => e.category === params.category) : entries;

  return (
    <div>
      <PageHeader
        title="Tentative Prices"
        description="Quotable prices for items not currently held in stock"
        action={
          <Link href="/products" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← Back to Products
          </Link>
        }
      />
      <div className="p-6 space-y-4">
        <Card className="p-5">
          <TentativePriceLookup entries={lookupOptions} />
        </Card>

        <form className="flex flex-wrap gap-3 items-center" action="/products/tentative">
          <select
            name="category"
            defaultValue={params.category ?? ""}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 transition-colors"
          >
            Filter
          </button>
          {params.category && (
            <Link href="/products/tentative" className="text-sm text-slate-500 hover:text-slate-700">
              Clear
            </Link>
          )}
        </form>

        <Card>
          {filteredEntries.length === 0 ? (
            <EmptyState
              title="No tentative prices found"
              description={params.category ? "No entries in this category." : "Check back once some have been added."}
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
                  {filteredEntries.map((entry) => (
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
      </div>
    </div>
  );
}
