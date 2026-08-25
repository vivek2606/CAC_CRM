import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ProductForm } from "../../product-form";
import { updateProduct } from "../../actions";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireHead();

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) notFound();

  const action = updateProduct.bind(null, product.id);

  return (
    <div>
      <PageHeader title={`Edit: ${product.code}`} />
      <div className="p-6">
        <Card className="p-6">
          <ProductForm action={action} defaultValues={product} submitLabel="Save Changes" />
        </Card>
      </div>
    </div>
  );
}
