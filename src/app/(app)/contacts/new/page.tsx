import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds, isBackOffice } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ContactForm } from "../contact-form";
import { createContact } from "../actions";

export default async function NewContactPage() {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);

  const [owners, accounts] = await Promise.all([
    isBackOffice(user)
      ? prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.account.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PageHeader title="New Contact" description="Add a person you're in touch with" />
      <div className="p-6">
        <Card className="p-6">
          <ContactForm
            action={createContact}
            isHead={isBackOffice(user)}
            owners={owners.map((o) => ({ id: o.id, label: o.name }))}
            accounts={accounts.map((a) => ({ id: a.id, label: a.name }))}
            defaultValues={{ ownerId: isBackOffice(user) ? owners[0]?.id : user.id }}
            submitLabel="Create Contact"
          />
        </Card>
      </div>
    </div>
  );
}
