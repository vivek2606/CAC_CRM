import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { PageHeader, Card, Badge, Avatar } from "@/components/ui";
import { DEAL_STAGE_LABELS, DEAL_STAGE_COLORS, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { NotesSection } from "../../notes-section";
import { ActivitiesSection } from "../../activities-section";
import { deleteContact } from "../actions";
import { Pencil, Trash2 } from "lucide-react";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, avatarColor: true } },
      account: { select: { id: true, name: true } },
      leads: { orderBy: { createdAt: "desc" } },
      deals: { orderBy: { updatedAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true, avatarColor: true } } } },
    },
  });

  if (!contact) notFound();
  if (!canAccessOwner(user, contact.ownerId)) redirect("/contacts");

  const deleteAction = deleteContact.bind(null, contact.id);

  return (
    <div>
      <PageHeader
        title={`${contact.firstName} ${contact.lastName}`}
        description={[contact.jobTitle, contact.account?.name].filter(Boolean).join(" at ") || undefined}
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/contacts/${contact.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
            <form action={deleteAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-slate-500 text-sm font-medium px-3 py-2 transition-colors"
                aria-label="Delete contact"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </form>
          </div>
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {(contact.deals.length > 0 || contact.leads.length > 0) && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Related deals &amp; leads</h2>
              <div className="divide-y divide-slate-100">
                {contact.deals.map((deal) => {
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
                {contact.leads.map((lead) => {
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
            </Card>
          )}

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Activities</h2>
            <ActivitiesSection
              activities={contact.activities}
              target={{ contactId: contact.id, ownerId: contact.ownerId }}
              path={`/contacts/${contact.id}`}
            />
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Notes</h2>
            <NotesSection notes={contact.notes} target={{ contactId: contact.id }} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Details</h2>
            <dl className="space-y-3 text-sm">
              {contact.department && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Department</dt>
                  <dd className="text-slate-700">{contact.department}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Email</dt>
                <dd className="text-slate-700 truncate max-w-[160px]">{contact.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Phone</dt>
                <dd className="text-slate-700">{contact.phone ?? "—"}</dd>
              </div>
              {contact.whatsappNumber && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">WhatsApp</dt>
                  <dd className="text-slate-700">{contact.whatsappNumber}</dd>
                </div>
              )}
              {contact.account && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Account</dt>
                  <dd>
                    <Link href={`/accounts/${contact.account.id}`} className="text-indigo-600 hover:text-indigo-700">
                      {contact.account.name}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Owner</h2>
            <div className="flex items-center gap-3">
              <Avatar name={contact.owner.name} color={contact.owner.avatarColor} size={9} />
              <span className="text-sm text-slate-700">{contact.owner.name}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
