import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, NewButton } from "@/components/ui";
import { AccountsTable } from "./accounts-table";

export default async function AccountsPage() {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);

  const accounts = await prisma.account.findMany({
    where: { ownerId: { in: ownerIds } },
    orderBy: { name: "asc" },
    include: {
      owner: { select: { name: true, avatarColor: true } },
      _count: { select: { contacts: true, deals: true, leads: true } },
    },
  });
  const tableAccounts = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    code: a.code,
    website: a.website,
    industry: a.industry,
    city: a.city,
    contactCount: a._count.contacts,
    dealCount: a._count.deals,
    owner: a.owner,
  }));

  return (
    <div>
      <PageHeader
        title="Accounts"
        description={`${accounts.length} compan${accounts.length === 1 ? "y" : "ies"}`}
        action={<NewButton href="/accounts/new" label="New Account" />}
      />
      <div className="p-6 space-y-4">
        <AccountsTable accounts={tableAccounts} />
      </div>
    </div>
  );
}
