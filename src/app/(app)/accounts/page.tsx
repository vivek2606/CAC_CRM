import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, NewButton, Card, EmptyState, Avatar } from "@/components/ui";
import { Pagination, parsePage } from "@/components/pagination";

const PAGE_SIZE = 50;

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);
  const params = await searchParams;
  const page = parsePage(params.page);

  const where = {
    ownerId: { in: ownerIds },
    ...(params.q ? { name: { contains: params.q, mode: "insensitive" as const } } : {}),
  };

  const [accounts, totalCount] = await Promise.all([
    prisma.account.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        owner: { select: { name: true, avatarColor: true } },
        _count: { select: { contacts: true, deals: true, leads: true } },
      },
    }),
    prisma.account.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Accounts"
        description={`${totalCount} compan${totalCount === 1 ? "y" : "ies"}`}
        action={<NewButton href="/accounts/new" label="New Account" />}
      />
      <div className="p-6 space-y-4">
        <form className="flex flex-wrap gap-3 items-center" action="/accounts">
          <input
            type="text"
            name="q"
            defaultValue={params.q}
            placeholder="Search company name..."
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 transition-colors"
          >
            Search
          </button>
          {params.q && (
            <Link href="/accounts" className="text-sm text-slate-500 hover:text-slate-700">
              Clear
            </Link>
          )}
        </form>

        <Card>
          {accounts.length === 0 ? (
            <EmptyState title="No accounts found" description="Try a different search, or add a new account." />
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
          <Pagination
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            basePath="/accounts"
            searchParams={{ q: params.q }}
          />
        </Card>
      </div>
    </div>
  );
}
