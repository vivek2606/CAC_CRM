import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { deleteProduct } from "../actions";
import { Pencil, Trash2 } from "lucide-react";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const [product, pricelistEntries, salesAgg, soldMonths, lastSale] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    // Only entries from the Stock & Price List workflow (the current
    // going-forward price) - landedCost is set only for those, never for
    // the historical Sales Register / Price Master rows, so this is exactly
    // "the dealer price from that upload onwards", with no landed price or
    // exchange rate mixed in (there's no exchange rate concept in pricing
    // at all anymore - it's purely a Naira-sales-to-USD reporting input).
    prisma.pricelist.findMany({
      where: { productId: id, landedCost: { not: null } },
      orderBy: { month: "desc" },
    }),
    prisma.saleLineItem.aggregate({
      where: { productId: id },
      _sum: { qty: true, value: true },
    }),
    prisma.saleLineItem.findMany({
      where: { productId: id },
      distinct: ["month"],
      select: { month: true },
    }),
    prisma.saleLineItem.findFirst({
      where: { productId: id },
      orderBy: { docDate: "desc" },
      select: { docDate: true },
    }),
  ]);

  if (!product) notFound();

  const unitsSold = salesAgg._sum.qty ?? 0;
  const revenueSold = salesAgg._sum.value ?? 0;
  const activeMonths = soldMonths.length;
  const avgUnitsPerMonth = activeMonths > 0 ? unitsSold / activeMonths : null;
  const avgRate = unitsSold > 0 ? revenueSold / unitsSold : null;

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
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Sales performance</h2>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Units sold so far</dt>
                <dd className="text-lg font-semibold text-slate-800 mt-0.5">{formatNumber(unitsSold)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Avg. units sold / month</dt>
                <dd className="text-lg font-semibold text-slate-800 mt-0.5">
                  {avgUnitsPerMonth != null ? avgUnitsPerMonth.toFixed(1) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Avg. rate sold at</dt>
                <dd className="text-lg font-semibold text-slate-800 mt-0.5">
                  {avgRate != null ? formatCurrency(avgRate) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Last sold</dt>
                <dd className="text-lg font-semibold text-slate-800 mt-0.5">
                  {lastSale ? formatDate(lastSale.docDate) : "—"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-400">
              Based on {activeMonths} month{activeMonths === 1 ? "" : "s"} with a recorded sale, across historical
              imports and deals won natively in the CRM.
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-slate-900">Current pricing</h2>
              {user.role === "HEAD" && (
                <Link
                  href={`/pricelist/new?productId=${product.id}`}
                  className="text-xs text-indigo-600 hover:text-indigo-700"
                >
                  + Add price entry
                </Link>
              )}
            </div>
            <p className="text-xs text-amber-600 mb-3">Dealer&apos;s Price excludes VAT @ 7.5%.</p>
            {pricelistEntries.length === 0 ? (
              <EmptyState
                title="No current price yet"
                description="Set from the Stock & Price List upload, or add one directly."
              />
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 font-medium">Month</th>
                    <th className="py-2 font-medium">Dealer&apos;s Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pricelistEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-2.5 text-slate-700">
                        {new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric" }).format(entry.month)}
                      </td>
                      <td className="py-2.5 text-slate-700">{formatCurrency(entry.dealerPrice)}</td>
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
