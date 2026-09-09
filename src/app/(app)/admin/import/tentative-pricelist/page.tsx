import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { ImportForm } from "./import-form";
import { deleteTentativePrice } from "./actions";
import { Trash2 } from "lucide-react";

export const maxDuration = 60;

export default async function TentativePricelistPage() {
  await requireHead();

  const entries = await prisma.tentativePrice.findMany({ orderBy: { model: "asc" } });

  return (
    <div>
      <PageHeader
        title="Tentative Price List"
        description="Quotable prices for models not currently held in stock"
        action={
          <Link href="/admin/import" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← All imports
          </Link>
        }
      />
      <div className="p-6 space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Before you upload</h2>
          <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside">
            <li>
              Columns required: <strong>MODEL</strong>, <strong>CATEGORY</strong>, and{" "}
              <strong>Dealer&apos;s Price</strong> — nothing else.
            </li>
            <li>
              This is a standalone list, entirely separate from Products/Stock &amp; Price List and the Sales
              Register - there&apos;s no product code and no matching against the product catalog. It&apos;s
              purely a model name mapped to a tentative price, so a rep can look up a model that isn&apos;t (or
              isn&apos;t yet) in the system.
            </li>
            <li>Re-uploading a model replaces its price with the new one.</li>
          </ul>
        </Card>
        <Card className="p-6">
          <ImportForm />
        </Card>

        <Card>
          {entries.length === 0 ? (
            <EmptyState title="No tentative prices set" description="Upload a file above to add some." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Dealer&apos;s Price</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((entry) => {
                    const deleteAction = deleteTentativePrice.bind(null, entry.id);
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">{entry.model}</td>
                        <td className="px-4 py-3 text-slate-500">{entry.category}</td>
                        <td className="px-4 py-3 text-slate-700">{formatCurrency(entry.dealerPrice)}</td>
                        <td className="px-4 py-3 text-right">
                          <form action={deleteAction}>
                            <button
                              type="submit"
                              className="text-slate-400 hover:text-red-600"
                              aria-label="Delete tentative price"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
