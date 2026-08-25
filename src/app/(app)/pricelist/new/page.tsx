import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { PricelistForm } from "../pricelist-form";
import { createPricelistEntry } from "../actions";
import Link from "next/link";

export default async function NewPricelistEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
}) {
  await requireHead();
  const { productId } = await searchParams;

  const products = await prisma.product.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, model: true, brand: true },
  });

  return (
    <div>
      <PageHeader title="New Price Entry" description="Add a monthly price entry for a product" />
      <div className="p-6">
        {products.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              title="No products yet"
              description="Add a product to the catalog before creating a price entry."
            />
            <div className="text-center mt-2">
              <Link href="/products/new" className="text-sm text-indigo-600 hover:text-indigo-700">
                Add a product →
              </Link>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <PricelistForm
              action={createPricelistEntry}
              products={products}
              defaultValues={{ productId }}
              submitLabel="Create Price Entry"
            />
          </Card>
        )}
      </div>
    </div>
  );
}
