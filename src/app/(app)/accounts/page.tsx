import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, NewButton, Card, EmptyState, Avatar } from "@/components/ui";

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

  return (
    <div>
      <PageHeader
        title="Accounts"
        description={`${accounts.length} compan${accounts.length === 1 ? "y" : "ies"}`}
        action={<NewButton href="/accounts/new" label="New Account" />}
      />
      <div className="p-6">
        <Card>
          {accounts.length === 0 ? (
            <EmptyState title="No accounts yet" description="Add companies you're working with." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Industry</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 font-medium">Contacts</th>
                  <th className="px-4 py-3 font-medium">Deals</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/accounts/${account.id}`} className="font-medium text-slate-800 hover:text-indigo-600">
                        {account.name}
                      </Link>
                      {account.website && <p className="text-xs text-slate-400">{account.website}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{account.industry ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{account.city ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{account._count.contacts}</td>
                    <td className="px-4 py-3 text-slate-600">{account._count.deals}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={account.owner.name} color={account.owner.avatarColor} size={6} />
                        <span className="text-slate-600">{account.owner.name}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
