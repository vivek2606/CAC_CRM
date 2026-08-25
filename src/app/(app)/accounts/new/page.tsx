import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { AccountForm } from "../account-form";
import { createAccount } from "../actions";

export default async function NewAccountPage() {
  const user = await requireUser();
  const owners =
    user.role === "HEAD"
      ? await prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
      : [];

  return (
    <div>
      <PageHeader title="New Account" description="Add a company you're working with" />
      <div className="p-6">
        <Card className="p-6">
          <AccountForm
            action={createAccount}
            isHead={user.role === "HEAD"}
            owners={owners.map((o) => ({ id: o.id, label: o.name }))}
            defaultValues={{ ownerId: user.role === "HEAD" ? owners[0]?.id : user.id }}
            submitLabel="Create Account"
          />
        </Card>
      </div>
    </div>
  );
}
