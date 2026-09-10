import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { getLatestPriceByProduct, getAvailableStockByProduct, getQuotableProducts } from "@/lib/pricing";
import { PageHeader, NewButton, Card } from "@/components/ui";
import { deletePricelistEntry } from "../pricelist/actions";
import { RecomputeCapacityButton } from "./recompute-capacity-button";
import { ProductLookup } from "./product-lookup";
import { ProductsTable } from "./products-table";
import { Tag } from "lucide-react";

export default async function ProductsPage() {
  const user = await requireUser();

  const [entries, allProducts, latestPriceByProduct, availableStockByProduct] = await Promise.all([
    prisma.pricelist.findMany({
      orderBy: [{ month: "desc" }, { createdAt: "desc" }],
      include: { product: { select: { id: true, code: true, model: true, category: true, capacityKw: true } } },
    }),
    getQuotableProducts(),
    getLatestPriceByProduct(),
    getAvailableStockByProduct(),
  ]);
  const lookupOptions = allProducts.map((p) => ({
    id: p.id,
    label: `${p.model} (${p.code})`,
    code: p.code,
    dealerPrice: latestPriceByProduct.get(p.id) ?? null,
    availableQty: availableStockByProduct.get(p.id) ?? null,
  }));
  const tableEntries = entries.map((entry) => ({
    id: entry.id,
    productId: entry.product.id,
    productCode: entry.product.code,
    model: entry.product.model,
    category: entry.product.category,
    capacityKw: entry.product.capacityKw,
    month: entry.month,
    dealerPrice: entry.dealerPrice,
  }));

  return (
    <div>
      <PageHeader
        title="Products"
        description={`${entries.length} price entr${entries.length === 1 ? "y" : "ies"}`}
        action={
          <div className="flex items-center gap-3">
            <Link
              href="/products/tentative"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3.5 py-2 transition-colors"
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

        <ProductsTable entries={tableEntries} isHead={user.role === "HEAD"} deleteAction={deletePricelistEntry} />
      </div>
    </div>
  );
}
