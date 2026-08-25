import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { PageHeader, NewButton, Card, EmptyState } from "@/components/ui";

export default async function ProductsPage() {
  const user = await requireUser();

  const products = await prisma.product.findMany({
    orderBy: { code: "asc" },
    include: { _count: { select: { pricelistEntries: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Products"
        description={`${products.length} product${products.length === 1 ? "" : "s"}`}
        action={user.role === "HEAD" ? <NewButton href="/products/new" label="New Product" /> : undefined}
      />
      <div className="p-6">
        <Card>
          {products.length === 0 ? (
            <EmptyState title="No products yet" description="Add your product catalog to start building pricelists." />
          ) : (
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
                    <td className="px-4 py-3 text-slate-600">{product.capacityKw}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
