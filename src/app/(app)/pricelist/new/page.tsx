import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { getProductCategoryOptions } from "@/lib/product-options";
import { PageHeader, Card } from "@/components/ui";
import { ProductPriceForm } from "../product-price-form";
import { createProductAndPricelistEntry } from "../actions";

export default async function NewPricelistEntryPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  await requireHead();
  const { productId } = await searchParams;
  const [products, { categories, subCategories }] = await Promise.all([
    prisma.product.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, model: true, brand: true } }),
    getProductCategoryOptions(),
  ]);

  return (
    <div>
      <PageHeader title="New Price Entry" description="Price an existing product, or add a new one to the catalog and price it in one step" />
      <div className="p-6">
        <Card className="p-6">
          <ProductPriceForm
            action={createProductAndPricelistEntry}
            products={products}
            categories={categories}
            subCategories={subCategories}
            defaultValues={{ productId }}
            submitLabel="Create Price Entry"
          />
        </Card>
      </div>
    </div>
  );
}
