import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { PageHeader, Card, Badge, EmptyState, Avatar } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { DEAL_STAGE_LABELS, DEAL_STAGE_COLORS, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from "@/lib/constants";
import { DeleteAccountButton } from "../delete-account-button";
import { Pencil, Trash2 } from "lucide-react";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, avatarColor: true } },
      contacts: { orderBy: { firstName: "asc" } },
      leads: { orderBy: { createdAt: "desc" } },
      deals: { orderBy: { updatedAt: "desc" } },
    },
  });

  if (!account) notFound();
  if (!canAccessOwner(user, account.ownerId)) redirect("/accounts");

  const hasWonDeal = account.deals.some((d) => d.stage === "WON");

  return (
    <div>
      <PageHeader
        title={account.name}
        description={[account.industry, account.city].filter(Boolean).join(" · ") || undefined}
        action={
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
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
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
              <div className="flex justify-between">
                <dt className="text-slate-500">City</dt>
                <dd className="text-slate-700">{account.city ?? "—"}</dd>
              </div>
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
  );
}
