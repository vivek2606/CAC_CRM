import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { DealForm } from "../deal-form";
import { createDeal } from "../actions";

export default async function NewDealPage() {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);

  const [owners, accounts, contacts, products, recentPrices] = await Promise.all([
    user.role === "HEAD"
      ? prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.account.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true, name: true } }),
    prisma.contact.findMany({
      where: { ownerId: { in: ownerIds } },
      select: { id: true, firstName: true, lastName: true, accountId: true },
    }),
    prisma.product.findMany({ orderBy: { model: "asc" }, select: { id: true, code: true, model: true } }),
    prisma.pricelist.findMany({ orderBy: { month: "desc" }, select: { productId: true, landedPrice: true, dealerPrice: true } }),
  ]);
  const latestPriceByProduct = new Map<string, number>();
  for (const p of recentPrices) {
    if (!latestPriceByProduct.has(p.productId)) {
      latestPriceByProduct.set(p.productId, p.landedPrice ?? p.dealerPrice);
    }
  }
  const productOptions = products.map((p) => ({
    id: p.id,
    label: `${p.model} (${p.code})`,
    defaultPrice: latestPriceByProduct.get(p.id) ?? null,
  }));

  return (
    <div>
      <PageHeader title="New Deal" description="Add a deal to the pipeline" />
      <div className="p-6">
        <Card className="p-6">
          <DealForm
            action={createDeal}
            isHead={user.role === "HEAD"}
            owners={owners.map((o) => ({ id: o.id, label: o.name }))}
            accounts={accounts.map((a) => ({ id: a.id, label: a.name }))}
            contacts={contacts.map((c) => ({
              id: c.id,
              label: `${c.firstName} ${c.lastName}`,
              accountId: c.accountId,
            }))}
            products={productOptions}
            defaultValues={{ ownerId: user.role === "HEAD" ? owners[0]?.id : user.id }}
            submitLabel="Create Deal"
          />
        </Card>
      </div>
    </div>
  );
}
