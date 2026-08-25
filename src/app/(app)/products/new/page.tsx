import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ProductForm } from "../product-form";
import { createProduct } from "../actions";

export default async function NewProductPage() {
  await requireHead();

  return (
    <div>
      <PageHeader title="New Product" description="Add a product to the catalog" />
      <div className="p-6">
        <Card className="p-6">
          <ProductForm action={createProduct} submitLabel="Create Product" />
        </Card>
      </div>
    </div>
  );
}
