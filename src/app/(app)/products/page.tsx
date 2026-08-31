import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { PageHeader, NewButton, Card, EmptyState } from "@/components/ui";
import { Pagination, parsePage } from "@/components/pagination";
import { RecomputeCapacityButton } from "./recompute-capacity-button";

const PAGE_SIZE = 50;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; category?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const page = parsePage(params.page);

  const where = {
    ...(params.category ? { category: params.category } : {}),
    ...(params.q
      ? {
          OR: [
            { code: { contains: params.q, mode: "insensitive" as const } },
            { model: { contains: params.q, mode: "insensitive" as const } },
            { category: { contains: params.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [products, totalCount, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { pricelistEntries: true } } },
    }),
    prisma.product.count({ where }),
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
        title="Products"
        description={`${totalCount} product${totalCount === 1 ? "" : "s"}`}
        action={
          user.role === "HEAD" ? (
            <div className="flex items-center gap-3">
              <RecomputeCapacityButton />
              <NewButton href="/products/new" label="New Product" />
            </div>
          ) : undefined
        }
      />
      <div className="p-6 space-y-4">
        <form className="flex flex-wrap gap-3 items-center" action="/products">
          <input
            type="text"
            name="q"
            defaultValue={params.q}
            placeholder="Search code, model or category..."
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
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
          {(params.q || params.category) && (
            <Link href="/products" className="text-sm text-slate-500 hover:text-slate-700">
              Clear
            </Link>
          )}
        </form>

        <Card>
          {products.length === 0 ? (
            <EmptyState title="No products found" description="Try a different search, or add a new product." />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Product Code</th>
                  <th className="px-4 py-3 font-medium">Brand</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Sub-Category</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Capacity (kW)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/products/${product.id}`}
                        className="font-medium text-slate-800 hover:text-indigo-600"
                      >
                        {product.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{product.brand}</td>
                    <td className="px-4 py-3 text-slate-500">{product.category}</td>
                    <td className="px-4 py-3 text-slate-500">{product.subCategory}</td>
                    <td className="px-4 py-3 text-slate-600">{product.model}</td>
                    <td className="px-4 py-3 text-slate-600">{product.capacityKw ?? "—"}</td>
                  </tr>
                ))}
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
            searchParams={{ q: params.q, category: params.category }}
          />
        </Card>
      </div>
    </div>
  );
}
