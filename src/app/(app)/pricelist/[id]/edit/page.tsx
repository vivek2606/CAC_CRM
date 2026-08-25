import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { PricelistForm } from "../../pricelist-form";
import { updatePricelistEntry } from "../../actions";

export default async function EditPricelistEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireHead();

  const [entry, products] = await Promise.all([
    prisma.pricelist.findUnique({ where: { id } }),
    prisma.product.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, model: true, brand: true } }),
  ]);

  if (!entry) notFound();

  const action = updatePricelistEntry.bind(null, entry.id);
  const monthValue = entry.month.toISOString().slice(0, 7);

  return (
    <div>
      <PageHeader title="Edit Price Entry" />
      <div className="p-6">
        <Card className="p-6">
          <PricelistForm
            action={action}
            products={products}
            defaultValues={{
              productId: entry.productId,
              month: monthValue,
              dealerPrice: entry.dealerPrice,
              landedPrice: entry.landedPrice,
              exchangeRate: entry.exchangeRate,
            }}
            submitLabel="Save Changes"
          />
        </Card>
      </div>
    </div>
  );
}
