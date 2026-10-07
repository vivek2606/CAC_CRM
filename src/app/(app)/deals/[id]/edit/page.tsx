import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds, canAccessOwner, isBackOffice } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { DealForm } from "../../deal-form";
import { updateDeal } from "../../actions";
import { getAvailableStockByProduct, getInTransitByProduct, getLatestPriceByProduct, getQuotableProducts, inTransitLabel } from "@/lib/pricing";

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: { items: { orderBy: { createdAt: "asc" }, select: { productId: true, qty: true, unitPrice: true, product: { select: { model: true, code: true } } } } },
  });
  if (!deal) notFound();
  if (!canAccessOwner(user, deal.ownerId)) redirect("/deals");

  // Products can be edited here too - except on a deal imported from the
  // Sales Register, whose lines come from the register.
  const editableProducts = deal.sourceTxnNo == null;
  const [products, prices, stock, inTransit] = editableProducts
    ? await Promise.all([getQuotableProducts(), getLatestPriceByProduct(), getAvailableStockByProduct(), getInTransitByProduct()])
    : [[], new Map<string, number>(), new Map<string, number>(), new Map<string, { qty: number; eta: Date | null }>()];
  const productOptions = editableProducts
    ? [
        ...products.map((p) => ({
          id: p.id,
          label: `${p.model} (${p.code})`,
          defaultPrice: prices.get(p.id) ?? null,
          availableQty: stock.get(p.id) ?? null,
          inTransitLabel: inTransitLabel(inTransit.get(p.id)),
        })),
        // The deal's own products, even ones with no dealer price on file.
        ...deal.items
          .filter((i, n, all) => !products.some((p) => p.id === i.productId) && all.findIndex((x) => x.productId === i.productId) === n)
          .map((i) => ({ id: i.productId, label: `${i.product.model} (${i.product.code})`, defaultPrice: null, availableQty: null, inTransitLabel: null })),
      ]
    : undefined;

  const [owners, accounts, contacts] = await Promise.all([
    isBackOffice(user)
      ? prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.account.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true, name: true } }),
    prisma.contact.findMany({
      where: { ownerId: { in: ownerIds } },
      select: { id: true, firstName: true, lastName: true, accountId: true, phone: true },
    }),
  ]);

  const action = updateDeal.bind(null, deal.id);

  return (
    <div>
      <PageHeader title={`Edit: ${deal.title}`} />
      <div className="p-6">
        <Card className="p-6">
          <DealForm
            action={action}
            isHead={isBackOffice(user)}
            owners={owners.map((o) => ({ id: o.id, label: o.name }))}
            accounts={accounts.map((a) => ({ id: a.id, label: a.name }))}
            contacts={contacts.map((c) => ({
              id: c.id,
              label: `${c.firstName} ${c.lastName}`,
              accountId: c.accountId,
              phone: c.phone,
            }))}
            defaultValues={{
              title: deal.title,
              customerName: deal.customerName,
              customerPhone: deal.customerPhone,
              stage: deal.stage,
              value: deal.value,
              probability: deal.probability,
              expectedCloseDate: deal.expectedCloseDate
                ? deal.expectedCloseDate.toISOString().slice(0, 10)
                : null,
              accountId: deal.accountId,
              contactId: deal.contactId,
              ownerId: deal.ownerId,
              equipmentType: deal.equipmentType,
              endUseSegment: deal.endUseSegment,
              competitorBrand: deal.competitorBrand,
              paymentTerms: deal.paymentTerms,
              invoiceNo: deal.invoiceNo ?? (deal.sourceTxnNo != null ? String(deal.sourceTxnNo) : null),
              expectedDeliveryDate: deal.expectedDeliveryDate
                ? deal.expectedDeliveryDate.toISOString().slice(0, 10)
                : null,
              tags: deal.tags,
              createdAt: deal.createdAt.toISOString().slice(0, 10),
            }}
            productsTotal={deal.items.length ? Math.round(deal.items.reduce((t, i) => t + i.qty * i.unitPrice, 0) * 100) / 100 : null}
            products={productOptions}
            requireItems={deal.stage === "WON"}
            initialItems={deal.items.map((i) => ({ productId: i.productId, qty: String(i.qty), unitPrice: String(i.unitPrice) }))}
            submitLabel="Save Changes"
          />
        </Card>
      </div>
    </div>
  );
}
