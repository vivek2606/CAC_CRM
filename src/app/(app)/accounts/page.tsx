import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds, isBackOffice } from "@/lib/rbac";
import { PageHeader, NewButton } from "@/components/ui";
import { AccountsTable } from "./accounts-table";
import { ContactsList } from "../contacts/contacts-list";
import { WinBackTable } from "./win-back-table";
import { getWinBackList } from "@/lib/win-back";

const WIN_BACK_MONTHS = [3, 6, 9, 12, 18, 24];

// Accounts & Contacts: companies, the people at them, and customers who
// haven't bought in a while (Win-back).
export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ tab?: string; months?: string }> }) {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);
  const sp = await searchParams;
  const tab = sp.tab === "contacts" ? "contacts" : sp.tab === "winback" ? "winback" : "accounts";
  const months = WIN_BACK_MONTHS.includes(Number(sp.months)) ? Number(sp.months) : 6;

  const [accountCount, contactCount] = await Promise.all([
    prisma.account.count({ where: { ownerId: { in: ownerIds } } }),
    prisma.contact.count({ where: { ownerId: { in: ownerIds } } }),
  ]);

  const tabLink = (key: "accounts" | "contacts" | "winback", label: string, count?: number) => (
    <Link
      href={key === "accounts" ? "/accounts" : `/accounts?tab=${key}`}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
    >
      {label} {count != null && <span className="text-xs text-slate-400">{count}</span>}
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Accounts & Contacts"
        description={`${accountCount} compan${accountCount === 1 ? "y" : "ies"} · ${contactCount} contact${contactCount === 1 ? "" : "s"}`}
        action={
          <div className="flex items-center gap-2">
            {isBackOffice(user) && (
              <Link href="/accounts/duplicates" className="mr-2 text-sm text-indigo-600 hover:text-indigo-700">
                Find duplicates
              </Link>
            )}
            <NewButton href="/accounts/new" label="New Account" />
            <NewButton href="/contacts/new" label="New Contact" />
          </div>
        }
      />
      <div className="p-6 space-y-4">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {tabLink("accounts", "Accounts", accountCount)}
          {tabLink("contacts", "Contacts", contactCount)}
          {tabLink("winback", "Win-back")}
        </div>
        {tab === "contacts" ? (
          <ContactsTab ownerIds={ownerIds} />
        ) : tab === "winback" ? (
          <WinBackTab ownerIds={ownerIds} months={months} showOwner={ownerIds.length > 1} />
        ) : (
          <AccountsTab ownerIds={ownerIds} />
        )}
      </div>
    </div>
  );
}

async function AccountsTab({ ownerIds }: { ownerIds: string[] }) {
  const accounts = await prisma.account.findMany({
    where: { ownerId: { in: ownerIds } },
    orderBy: { name: "asc" },
    include: {
      owner: { select: { name: true, avatarColor: true } },
      _count: { select: { contacts: true, deals: true, leads: true } },
    },
  });
  return (
    <AccountsTable
      accounts={accounts.map((a) => ({
        id: a.id,
        name: a.name,
        code: a.code,
        website: a.website,
        industry: a.industry,
        city: a.city,
        contactCount: a._count.contacts,
        dealCount: a._count.deals,
        owner: a.owner,
        tags: a.tags,
      }))}
    />
  );
}

async function ContactsTab({ ownerIds }: { ownerIds: string[] }) {
  const contacts = await prisma.contact.findMany({
    where: { ownerId: { in: ownerIds } },
    orderBy: { firstName: "asc" },
    include: {
      owner: { select: { name: true, avatarColor: true } },
      account: { select: { name: true } },
    },
  });
  return <ContactsList contacts={contacts} />;
}

async function WinBackTab({ ownerIds, months, showOwner }: { ownerIds: string[]; months: number; showOwner: boolean }) {
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate()));
  const rows = await getWinBackList(ownerIds, cutoff);
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-end gap-3" action="/accounts">
        <input type="hidden" name="tab" value="winback" />
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Customers who haven&apos;t bought for</label>
          <select name="months" defaultValue={months} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            {WIN_BACK_MONTHS.map((m) => (
              <option key={m} value={m}>
                {m} months or more
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Show
        </button>
        <p className="pb-2 text-xs text-slate-500">
          From the Sales Register and deals won in the CRM. Shared cash / service / retail customer accounts are left out. Biggest past buyers first.
        </p>
      </form>
      <WinBackTable rows={rows} showOwner={showOwner} />
    </div>
  );
}
