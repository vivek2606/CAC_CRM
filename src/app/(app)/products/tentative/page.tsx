import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { getAllTentativePrices } from "@/lib/pricing";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { TentativePriceLookup } from "../tentative-price-lookup";

export default async function TentativePricesPage() {
  await requireUser();

  const entries = await getAllTentativePrices();
  const lookupOptions = entries.map((e) => ({
    id: e.model,
    label: e.model,
    category: e.category,
    dealerPrice: e.dealerPrice,
  }));

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

        <Card>
          {entries.length === 0 ? (
            <EmptyState title="No tentative prices set" description="Check back once some have been added." />
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
                  {entries.map((entry) => (
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
