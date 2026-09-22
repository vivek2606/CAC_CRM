import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { getLatestPriceByProduct, getAvailableStockByProduct, getQuotableProducts } from "@/lib/pricing";
import { PageHeader, Card } from "@/components/ui";
import { DealForm } from "../deal-form";
import { createDeal } from "../actions";

export default async function NewDealPage() {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);

  const [owners, accounts, contacts, products, latestPriceByProduct, availableStockByProduct, wonDealsForCycle] =
    await Promise.all([
      user.role === "HEAD"
        ? prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
        : Promise.resolve([]),
      prisma.account.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true, name: true } }),
      prisma.contact.findMany({
        where: { ownerId: { in: ownerIds } },
        select: { id: true, firstName: true, lastName: true, accountId: true, phone: true },
      }),
      getQuotableProducts(),
      getLatestPriceByProduct(),
      getAvailableStockByProduct(),
      // Feeds the Expected Close Date's smart default below - only WON
      // deals have a real, meaningful cycle length (an open deal's "cycle
      // so far" isn't its actual cycle length yet).
      prisma.deal.findMany({
        where: { ownerId: { in: ownerIds }, stage: "WON", closedAt: { not: null } },
        select: { createdAt: true, closedAt: true },
      }),
    ]);
  const productOptions = products.map((p) => ({
    id: p.id,
    label: `${p.model} (${p.code})`,
    defaultPrice: latestPriceByProduct.get(p.id) ?? null,
    availableQty: availableStockByProduct.get(p.id) ?? null,
  }));

  // Smart default Expected Close Date: today + the team's average historical
  // sales cycle length, rather than leaving the field blank - a starting
  // point the rep can freely override, not a hard prediction.
  const avgCycleDays =
    wonDealsForCycle.length > 0
      ? Math.round(
          wonDealsForCycle.reduce((s, d) => s + (d.closedAt!.getTime() - d.createdAt.getTime()) / 86400000, 0) /
            wonDealsForCycle.length
        )
      : null;
  const smartCloseDate = (() => {
    if (avgCycleDays == null) return null;
    const d = new Date();
    d.setDate(d.getDate() + avgCycleDays);
    return d.toISOString().slice(0, 10);
  })();

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
              phone: c.phone,
            }))}
            products={productOptions}
            defaultValues={{
              ownerId: user.role === "HEAD" ? owners[0]?.id : user.id,
              expectedCloseDate: smartCloseDate,
            }}
            submitLabel="Create Deal"
          />
        </Card>
      </div>
    </div>
  );
}
