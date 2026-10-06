import { prisma } from "@/lib/prisma";
import { requireUser, isBackOffice } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { AccountForm } from "../account-form";
import { createAccount } from "../actions";

export default async function NewAccountPage() {
  const user = await requireUser();
  const owners =
    isBackOffice(user)
      ? await prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
      : [];
  // Every account name+code, across all reps - a duplicate customer can
  // already be registered under someone else's ownership, so the "already
  // exists" check needs to see the whole company, not just this rep's own.
  const accounts = await prisma.account.findMany({ select: { id: true, name: true, code: true } });
  // Every contact, so a rep can link one that's already in the CRM as this
  // new account's primary contact (or create a fresh one inline instead).
  const contacts = await prisma.contact.findMany({
    orderBy: { firstName: "asc" },
    select: { id: true, firstName: true, lastName: true, jobTitle: true },
  });

  return (
    <div>
      <PageHeader title="New Account" description="Add a company you're working with" />
      <div className="p-6">
        <Card className="p-6">
          <AccountForm
            action={createAccount}
            isHead={isBackOffice(user)}
            owners={owners.map((o) => ({ id: o.id, label: o.name }))}
            accounts={accounts}
            contacts={contacts.map((c) => ({
              id: c.id,
              label: c.jobTitle ? `${c.firstName} ${c.lastName} (${c.jobTitle})` : `${c.firstName} ${c.lastName}`,
            }))}
            defaultValues={{ ownerId: isBackOffice(user) ? owners[0]?.id : user.id }}
            submitLabel="Create Account"
          />
        </Card>
      </div>
    </div>
  );
}
