import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds, canAccessOwner } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { DealForm } from "../../deal-form";
import { updateDeal } from "../../actions";

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);

  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal) notFound();
  if (!canAccessOwner(user, deal.ownerId)) redirect("/deals");

  const [owners, accounts, contacts] = await Promise.all([
    user.role === "HEAD"
      ? prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.account.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true, name: true } }),
    prisma.contact.findMany({
      where: { ownerId: { in: ownerIds } },
      select: { id: true, firstName: true, lastName: true, accountId: true },
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
            isHead={user.role === "HEAD"}
            owners={owners.map((o) => ({ id: o.id, label: o.name }))}
            accounts={accounts.map((a) => ({ id: a.id, label: a.name }))}
            contacts={contacts.map((c) => ({
              id: c.id,
              label: `${c.firstName} ${c.lastName}`,
              accountId: c.accountId,
            }))}
            defaultValues={{
              title: deal.title,
              customerName: deal.customerName,
              customerPhone: deal.customerPhone,
              stage: deal.stage === "WON" || deal.stage === "LOST" ? "QUALIFICATION" : deal.stage,
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
            }}
            submitLabel="Save Changes"
          />
        </Card>
      </div>
    </div>
  );
}
