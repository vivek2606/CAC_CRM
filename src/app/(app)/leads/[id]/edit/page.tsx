import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds, canAccessOwner } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { LeadForm } from "../../lead-form";
import { updateLead } from "../../actions";

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);

  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) notFound();
  if (!canAccessOwner(user, lead.ownerId)) redirect("/leads");

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

  const action = updateLead.bind(null, lead.id);

  return (
    <div>
      <PageHeader title={`Edit: ${lead.title}`} />
      <div className="p-6">
        <Card className="p-6">
          <LeadForm
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
              title: lead.title,
              company: lead.company,
              status: lead.status,
              winProbability: lead.winProbability,
              source: lead.source,
              equipmentType: lead.equipmentType,
              endUseSegment: lead.endUseSegment,
              competitorBrand: lead.competitorBrand,
              value: lead.value,
              email: lead.email,
              phone: lead.phone,
              notes: lead.notes,
              accountId: lead.accountId,
              contactId: lead.contactId,
              ownerId: lead.ownerId,
            }}
            submitLabel="Save Changes"
          />
        </Card>
      </div>
    </div>
  );
}
