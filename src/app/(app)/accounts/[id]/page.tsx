import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { PageHeader, Card, Badge, EmptyState, Avatar } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { NOT_DRAFT, visibleQuotationsWhere } from "@/lib/saved-quotes";
import {
  DEAL_STAGE_LABELS,
  DEAL_STAGE_COLORS,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  ACCOUNT_TYPE_LABELS,
} from "@/lib/constants";
import { DeleteAccountButton } from "../delete-account-button";
import { TagChips } from "@/components/tag-chips";
import { Pencil, Trash2 } from "lucide-react";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const found = await prisma.account.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, avatarColor: true } },
      contacts: { orderBy: { firstName: "asc" } },
      leads: { orderBy: { createdAt: "desc" } },
      deals: { orderBy: { updatedAt: "desc" } },
    },
  });

  if (!found) notFound();
  // Anyone can open any account (all accounts can be linked to deals and
  // leads); someone who doesn't own it sees it read-only, with only their
  // own deals, leads and contacts on it.
  const isOwner = canAccessOwner(user, found.ownerId);
  const mine = <T extends { ownerId: string }>(xs: T[]) => (isOwner ? xs : xs.filter((x) => x.ownerId === user.id));
  const account = { ...found, contacts: mine(found.contacts), leads: mine(found.leads), deals: mine(found.deals) };

  const hasWonDeal = account.deals.some((d) => d.stage === "WON");
  // Quotations for this account: picked as the customer, on its deals, or
  // (saved before accounts could be picked) made out to its exact name.
  const quotes = await prisma.quotation.findMany({
    where: {
      AND: [
        visibleQuotationsWhere(user),
        NOT_DRAFT,
        { OR: [{ data: { path: ["accountId"], equals: account.id } }, { deal: { accountId: account.id } }, { customerName: { equals: account.name, mode: "insensitive" } }] },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, ref: true, type: true, total: true, createdAt: true, owner: { select: { name: true } }, deal: { select: { id: true, title: true } } },
  });

  return (
    <div>
      <PageHeader
        title={account.name}
        description={[account.industry, account.city].filter(Boolean).join(" · ") || undefined}
        action={
          !isOwner ? (
            <span className="text-xs text-slate-500">
              Owned by {account.owner.name} - showing your own deals, leads and contacts only
            </span>
          ) : (
          <div className="flex items-center gap-2">
            <Link
              href={`/accounts/${account.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
            {hasWonDeal ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-slate-300 text-sm font-medium px-3 py-2 cursor-not-allowed"
                title="This account has a completed order and can't be deleted."
              >
                <Trash2 className="h-4 w-4" />
              </span>
            ) : (
              <DeleteAccountButton accountId={account.id} accountName={account.name} />
            )}
          </div>
          )
        }
      />

      <div className="p-6 space-y-6">
        {account.tags.length > 0 && <TagChips tags={account.tags} />}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Deals</h2>
            {account.deals.length === 0 ? (
              <EmptyState title="No deals yet" />
            ) : (
              <div className="divide-y divide-slate-100">
                {account.deals.map((deal) => {
                  const colors = DEAL_STAGE_COLORS[deal.stage];
                  return (
                    <Link
                      key={deal.id}
                      href={`/deals/${deal.id}`}
                      className="flex items-center justify-between py-2.5 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors"
                    >
                      <span className="text-sm text-slate-800 truncate">{deal.title}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-medium text-slate-700">{formatCurrency(deal.value)}</span>
                        <Badge bg={colors.bg} text={colors.text}>
                          {DEAL_STAGE_LABELS[deal.stage]}
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Quotations ({quotes.length})</h2>
            {quotes.length === 0 ? (
              <EmptyState title="No quotations yet" description="Pick this account as the customer when preparing a quotation." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {quotes.map((q) => (
                      <tr key={q.id}>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <Link href={`/quotations?quote=${q.id}`} className="font-medium text-indigo-600 hover:text-indigo-500">
                            {q.ref}
                          </Link>
                          <span className="ml-2 text-xs text-slate-400">{{ quote: "Quotation", proforma: "Proforma", boq: "BOQ" }[q.type] ?? q.type}</span>
                        </td>
                        <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">{formatDate(q.createdAt)}</td>
                        <td className="py-2 pr-3 max-w-[200px] truncate text-slate-600">
                          {q.deal ? (
                            <Link href={`/deals/${q.deal.id}`} className="hover:text-indigo-600">
                              {q.deal.title}
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-400">No deal</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">{q.owner.name}</td>
                        <td className="py-2 text-right tabular-nums text-slate-800 whitespace-nowrap">{formatCurrency(q.total)}</td>
                        <td className="py-2 pl-3 text-right whitespace-nowrap">
                          <a href={`/quotations/saved/${q.id}/pdf`} className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
                            PDF
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Leads</h2>
            {account.leads.length === 0 ? (
              <EmptyState title="No leads yet" />
            ) : (
              <div className="divide-y divide-slate-100">
                {account.leads.map((lead) => {
                  const colors = LEAD_STATUS_COLORS[lead.status];
                  return (
                    <Link
                      key={lead.id}
                      href={`/leads/${lead.id}`}
                      className="flex items-center justify-between py-2.5 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors"
                    >
                      <span className="text-sm text-slate-800 truncate">{lead.title}</span>
                      <Badge bg={colors.bg} text={colors.text}>
                        {LEAD_STATUS_LABELS[lead.status]}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Contacts</h2>
            {account.contacts.length === 0 ? (
              <EmptyState title="No contacts yet" />
            ) : (
              <div className="divide-y divide-slate-100">
                {account.contacts.map((contact) => (
                  <Link
                    key={contact.id}
                    href={`/contacts/${contact.id}`}
                    className="flex items-center justify-between py-2.5 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <span className="text-sm text-slate-800">
                      {contact.firstName} {contact.lastName}
                    </span>
                    <span className="text-xs text-slate-400">{contact.jobTitle}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Details</h2>
            <dl className="space-y-3 text-sm">
              {account.code && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Customer code</dt>
                  <dd className="text-slate-700 font-mono">{account.code}</dd>
                </div>
              )}
              {account.accountType && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Account type</dt>
                  <dd className="text-slate-700">{ACCOUNT_TYPE_LABELS[account.accountType]}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Industry</dt>
                <dd className="text-slate-700">{account.industry ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Website</dt>
                <dd className="text-slate-700 truncate max-w-[160px]">{account.website ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Phone</dt>
                <dd className="text-slate-700">{account.phone ?? "—"}</dd>
              </div>
              {account.registrationNumber && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">RC number / Tax ID</dt>
                  <dd className="text-slate-700">{account.registrationNumber}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">City</dt>
                <dd className="text-slate-700">{account.city ?? "—"}</dd>
              </div>
              {account.state && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">State</dt>
                  <dd className="text-slate-700">{account.state}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Country</dt>
                <dd className="text-slate-700">{account.country ?? "—"}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Owner</h2>
            <div className="flex items-center gap-3">
              <Avatar name={account.owner.name} color={account.owner.avatarColor} size={9} />
              <span className="text-sm text-slate-700">{account.owner.name}</span>
            </div>
          </Card>
        </div>
        </div>
      </div>
    </div>
  );
}
