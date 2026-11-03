import { prisma } from "@/lib/prisma";
import { requireService } from "@/lib/service-access";
import { PageHeader, Card } from "@/components/ui";
import { toLagosInput } from "@/lib/service";
import { RegisterComplaintForm } from "./register-form";

export default async function NewComplaintPage() {
  await requireService();
  const [products, technicians] = await Promise.all([
    prisma.product.findMany({ orderBy: { model: "asc" }, select: { id: true, model: true, code: true } }),
    prisma.serviceComplaint.findMany({ where: { technician: { not: null } }, distinct: ["technician"], select: { technician: true } }),
  ]);
  return (
    <div>
      <PageHeader title="Register a complaint" description="Find the sale by its invoice no. - the customer, unit and warranty fill in" />
      <div className="p-6">
        <Card className="p-5">
          <RegisterComplaintForm
            now={toLagosInput(new Date())}
            products={products.map((p) => ({ id: p.id, label: `${p.model} (${p.code})` }))}
            technicians={technicians.map((t) => t.technician!)}
          />
        </Card>
      </div>
    </div>
  );
}
