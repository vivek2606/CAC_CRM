import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { AccountForm } from "../../account-form";
import { updateAccount } from "../../actions";

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) notFound();
  if (!canAccessOwner(user, account.ownerId)) redirect("/accounts");

  const owners =
    user.role === "HEAD"
      ? await prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
      : [];
  const accounts = await prisma.account.findMany({ select: { id: true, name: true, code: true } });
  // Every contact, so a rep can link one that's already in the CRM to this
  // account (or create a fresh one inline instead) - same as New Account.
  const contacts = await prisma.contact.findMany({
    orderBy: { firstName: "asc" },
    select: { id: true, firstName: true, lastName: true, jobTitle: true },
  });

  const action = updateAccount.bind(null, account.id);

  return (
    <div>
      <PageHeader title={`Edit: ${account.name}`} />
      <div className="p-6">
        <Card className="p-6">
          <AccountForm
            action={action}
            isHead={user.role === "HEAD"}
            owners={owners.map((o) => ({ id: o.id, label: o.name }))}
            accounts={accounts}
            contacts={contacts.map((c) => ({
              id: c.id,
              label: c.jobTitle ? `${c.firstName} ${c.lastName} (${c.jobTitle})` : `${c.firstName} ${c.lastName}`,
            }))}
            excludeId={account.id}
            defaultValues={{
              name: account.name,
              code: account.code,
              industry: account.industry,
              accountType: account.accountType,
              website: account.website,
              phone: account.phone,
              address: account.address,
              city: account.city,
              state: account.state,
              country: account.country,
              registrationNumber: account.registrationNumber,
              ownerId: account.ownerId,
            }}
            submitLabel="Save Changes"
          />
        </Card>
      </div>
    </div>
  );
}
