import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { getLatestPriceByProduct, getAvailableStockByProduct, getQuotableProducts } from "@/lib/pricing";
import { PageHeader, NewButton, Card, EmptyState } from "@/components/ui";
import { Pagination, parsePage } from "@/components/pagination";
import { formatCurrency } from "@/lib/format";
import { deletePricelistEntry } from "../pricelist/actions";
import { RecomputeCapacityButton } from "./recompute-capacity-button";
import { ProductLookup } from "./product-lookup";
import { Trash2, Pencil, Tag } from "lucide-react";

const PAGE_SIZE = 50;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; category?: string; page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const page = parsePage(params.page);
  const where = {
    ...(params.productId ? { productId: params.productId } : {}),
    ...(params.category ? { product: { category: params.category } } : {}),
  };

  const [entries, totalCount, allProducts, categories, latestPriceByProduct, availableStockByProduct] =
    await Promise.all([
      prisma.pricelist.findMany({
        where,
        orderBy: [{ month: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { product: { select: { id: true, code: true, model: true, category: true, capacityKw: true } } },
      }),
      prisma.pricelist.count({ where }),
      getQuotableProducts(),
      prisma.product.findMany({
        distinct: ["category"],
        select: { category: true },
        orderBy: { category: "asc" },
      }),
      getLatestPriceByProduct(),
      getAvailableStockByProduct(),
    ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const lookupOptions = allProducts.map((p) => ({
    id: p.id,
    label: `${p.model} (${p.code})`,
    code: p.code,
    dealerPrice: latestPriceByProduct.get(p.id) ?? null,
    availableQty: availableStockByProduct.get(p.id) ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="Products"
        description={`${totalCount} price entr${totalCount === 1 ? "y" : "ies"}`}
        action={
          <div className="flex items-center gap-3">
            <Link
              href="/products/tentative"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
            >
              <Tag className="h-4 w-4" />
              Tentative Prices for Unavailable Items
            </Link>
            {user.role === "HEAD" && (
              <>
                <RecomputeCapacityButton />
                <Link
                  href="/products/new"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
                >
                  New Product
                </Link>
                <NewButton href="/pricelist/new" label="New Price Entry" />
              </>
            )}
          </div>
        }
      />
      <div className="p-6 space-y-4">
        <Card className="p-5">
          <ProductLookup products={lookupOptions} />
        </Card>

        <form className="flex flex-wrap gap-3 items-center" action="/products">
          <select
            name="productId"
            defaultValue={params.productId ?? ""}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All products</option>
            {allProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
          <select
            name="category"
            defaultValue={params.category ?? ""}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 transition-colors"
          >
            Filter
          </button>
          {(params.productId || params.category) && (
            <Link href="/products" className="text-sm text-slate-500 hover:text-slate-700">
              Clear
            </Link>
          )}
        </form>

        <Card>
          {entries.length === 0 ? (
            <EmptyState title="No price entries found" description="Add a price entry for a product." />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Product Code</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Capacity (kW)</th>
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="px-4 py-3 font-medium">Dealer&apos;s Price</th>
                  {user.role === "HEAD" && <th className="px-4 py-3 font-medium" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => {
                  const deleteAction = deletePricelistEntry.bind(null, entry.id);
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        <Link href={`/products/${entry.product.id}`} className="hover:text-indigo-600">
                          {entry.product.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{entry.product.category}</td>
                      <td className="px-4 py-3 text-slate-600">{entry.product.model}</td>
                      <td className="px-4 py-3 text-slate-600">{entry.product.capacityKw ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric" }).format(entry.month)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatCurrency(entry.dealerPrice)}</td>
                      {user.role === "HEAD" && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <Link
                              href={`/pricelist/${entry.id}/edit`}
                              className="text-slate-400 hover:text-slate-700"
                              aria-label="Edit price entry"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                            <form action={deleteAction}>
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
          <Pagination
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            basePath="/products"
            searchParams={{ productId: params.productId, category: params.category }}
          />
        </Card>
      </div>
    </div>
  );
}
