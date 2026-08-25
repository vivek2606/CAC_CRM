import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds, canAccessOwner } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ContactForm } from "../../contact-form";
import { updateContact } from "../../actions";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) notFound();
  if (!canAccessOwner(user, contact.ownerId)) redirect("/contacts");

  const [owners, accounts] = await Promise.all([
    user.role === "HEAD"
      ? prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.account.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true, name: true } }),
  ]);

  const action = updateContact.bind(null, contact.id);

  return (
    <div>
      <PageHeader title={`Edit: ${contact.firstName} ${contact.lastName}`} />
      <div className="p-6">
        <Card className="p-6">
          <ContactForm
            action={action}
            isHead={user.role === "HEAD"}
            owners={owners.map((o) => ({ id: o.id, label: o.name }))}
            accounts={accounts.map((a) => ({ id: a.id, label: a.name }))}
            defaultValues={{
              firstName: contact.firstName,
              lastName: contact.lastName,
              email: contact.email,
              phone: contact.phone,
              jobTitle: contact.jobTitle,
              accountId: contact.accountId,
              ownerId: contact.ownerId,
            }}
            submitLabel="Save Changes"
          />
        </Card>
      </div>
    </div>
  );
}
