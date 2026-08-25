import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { deleteProduct } from "../actions";
import { Pencil, Trash2 } from "lucide-react";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const product = await prisma.product.findUnique({
    where: { id },
    include: { pricelistEntries: { orderBy: { month: "desc" } } },
  });

  if (!product) notFound();

  const deleteAction = deleteProduct.bind(null, product.id);

  return (
    <div>
      <PageHeader
        title={product.code}
        description={`${product.brand} · ${product.model}`}
        action={
          user.role === "HEAD" ? (
            <div className="flex items-center gap-2">
              <Link
                href={`/products/${product.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
              <form action={deleteAction}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-slate-500 text-sm font-medium px-3 py-2 transition-colors"
                  aria-label="Delete product"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </form>
            </div>
          ) : undefined
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Price history</h2>
              {user.role === "HEAD" && (
                <Link
                  href={`/pricelist/new?productId=${product.id}`}
                  className="text-xs text-indigo-600 hover:text-indigo-700"
                >
                  + Add price entry
                </Link>
              )}
            </div>
            {product.pricelistEntries.length === 0 ? (
              <EmptyState title="No price entries yet" />
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 font-medium">Month</th>
                    <th className="py-2 font-medium">Dealer&apos;s Price</th>
                    <th className="py-2 font-medium">Landed Price</th>
                    <th className="py-2 font-medium">Exchange Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {product.pricelistEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-2.5 text-slate-700">
                        {new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric" }).format(entry.month)}
                      </td>
                      <td className="py-2.5 text-slate-700">{formatCurrency(entry.dealerPrice)}</td>
                      <td className="py-2.5 text-slate-700">
                        {entry.landedPrice != null ? formatCurrency(entry.landedPrice) : "—"}
                      </td>
                      <td className="py-2.5 text-slate-500">₦{entry.exchangeRate.toFixed(2)} / $1</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Details</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Brand</dt>
              <dd className="text-slate-700">{product.brand}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Category</dt>
              <dd className="text-slate-700">{product.category}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Sub-Category</dt>
              <dd className="text-slate-700">{product.subCategory}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Model</dt>
              <dd className="text-slate-700">{product.model}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Capacity</dt>
              <dd className="text-slate-700">{product.capacityKw != null ? `${product.capacityKw} kW` : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Added</dt>
              <dd className="text-slate-700">{formatDate(product.createdAt)}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
