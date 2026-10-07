import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, NewButton } from "@/components/ui";
import { AccountsTable } from "./accounts-table";
import { ContactsList } from "../contacts/contacts-list";

// Accounts & Contacts: companies on one tab, the people at them on the other.
export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);
  const tab = (await searchParams).tab === "contacts" ? "contacts" : "accounts";

  const [accountCount, contactCount] = await Promise.all([
    prisma.account.count({ where: { ownerId: { in: ownerIds } } }),
    prisma.contact.count({ where: { ownerId: { in: ownerIds } } }),
  ]);

  const tabLink = (key: "accounts" | "contacts", label: string, count: number) => (
    <Link
      href={key === "contacts" ? "/accounts?tab=contacts" : "/accounts"}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
    >
      {label} <span className="text-xs text-slate-400">{count}</span>
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Accounts & Contacts"
        description={`${accountCount} compan${accountCount === 1 ? "y" : "ies"} · ${contactCount} contact${contactCount === 1 ? "" : "s"}`}
        action={
          <div className="flex items-center gap-2">
            <NewButton href="/accounts/new" label="New Account" />
            <NewButton href="/contacts/new" label="New Contact" />
          </div>
        }
      />
      <div className="p-6 space-y-4">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {tabLink("accounts", "Accounts", accountCount)}
          {tabLink("contacts", "Contacts", contactCount)}
        </div>
        {tab === "contacts" ? <ContactsTab ownerIds={ownerIds} /> : <AccountsTab ownerIds={ownerIds} />}
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
