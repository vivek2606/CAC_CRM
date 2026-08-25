import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { PageHeader, NewButton, Card, EmptyState } from "@/components/ui";
import { Pagination, parsePage } from "@/components/pagination";
import { formatCurrency } from "@/lib/format";
import { deletePricelistEntry } from "./actions";
import { Trash2, Pencil } from "lucide-react";

const PAGE_SIZE = 50;

export default async function PricelistPage({
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

  const [entries, totalCount, products, categories] = await Promise.all([
    prisma.pricelist.findMany({
      where,
      orderBy: [{ month: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { product: { select: { code: true, model: true, brand: true, category: true } } },
    }),
    prisma.pricelist.count({ where }),
    prisma.product.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true } }),
    prisma.product.findMany({
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Price List"
        description={`${totalCount} price entr${totalCount === 1 ? "y" : "ies"}`}
        action={user.role === "HEAD" ? <NewButton href="/pricelist/new" label="New Price Entry" /> : undefined}
      />
      <div className="p-6 space-y-4">
        <form className="flex flex-wrap gap-3 items-center" action="/pricelist">
          <select
            name="productId"
            defaultValue={params.productId ?? ""}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All products</option>
            {products.map((p) => (
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
            <Link href="/pricelist" className="text-sm text-slate-500 hover:text-slate-700">
              Clear
            </Link>
          )}
        </form>

        <Card>
          {entries.length === 0 ? (
            <EmptyState title="No price entries found" description="Add a price entry for a product." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Product Code</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="px-4 py-3 font-medium">Dealer&apos;s Price</th>
                  <th className="px-4 py-3 font-medium">Landed Price</th>
                  <th className="px-4 py-3 font-medium">Exchange Rate</th>
                  {user.role === "HEAD" && <th className="px-4 py-3 font-medium" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => {
                  const deleteAction = deletePricelistEntry.bind(null, entry.id);
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{entry.product.code}</td>
                      <td className="px-4 py-3 text-slate-500">{entry.product.category}</td>
                      <td className="px-4 py-3 text-slate-600">{entry.product.model}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric" }).format(entry.month)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatCurrency(entry.dealerPrice)}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {entry.landedPrice != null ? formatCurrency(entry.landedPrice) : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">₦{entry.exchangeRate.toFixed(2)} / $1</td>
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
          )}
          <Pagination
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            basePath="/pricelist"
            searchParams={{ productId: params.productId, category: params.category }}
          />
        </Card>
      </div>
    </div>
  );
}
