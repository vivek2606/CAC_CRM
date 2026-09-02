import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { PageHeader, Card, Badge, Avatar } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  winProbabilityColor,
  LEAD_SOURCE_LABELS,
  EQUIPMENT_TYPE_LABELS,
  END_USE_SEGMENT_LABELS,
} from "@/lib/constants";
import { NotesSection } from "../../notes-section";
import { ActivitiesSection } from "../../activities-section";
import { convertLeadToDeal, deleteLead } from "../actions";
import { Pencil, ArrowRightLeft, Trash2 } from "lucide-react";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, avatarColor: true } },
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      activities: { orderBy: { createdAt: "desc" } },
      noteItems: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true, avatarColor: true } } } },
      convertedDeal: { select: { id: true } },
    },
  });

  if (!lead) notFound();
  if (!canAccessOwner(user, lead.ownerId)) redirect("/leads");

  const colors = LEAD_STATUS_COLORS[lead.status];
  const convertAction = convertLeadToDeal.bind(null, lead.id);
  const deleteAction = deleteLead.bind(null, lead.id);

  return (
    <div>
      <PageHeader
        title={lead.title}
        description={lead.company ?? undefined}
        action={
          <div className="flex items-center gap-2">
            {lead.status !== "CONVERTED" ? (
              <form action={convertAction}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-3.5 py-2 transition-colors"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Convert to Deal
                </button>
              </form>
            ) : (
              lead.convertedDeal && (
                <Link
                  href={`/deals/${lead.convertedDeal.id}`}
                  className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  View converted deal →
                </Link>
              )
            )}
            <Link
              href={`/leads/${lead.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
            <form action={deleteAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-slate-500 text-sm font-medium px-3 py-2 transition-colors"
                aria-label="Delete lead"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </form>
          </div>
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Activities</h2>
            <ActivitiesSection
              activities={lead.activities}
              target={{ leadId: lead.id, ownerId: lead.ownerId }}
              path={`/leads/${lead.id}`}
            />
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Notes</h2>
            <NotesSection notes={lead.noteItems} target={{ leadId: lead.id }} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Customer</dt>
                <dd className="text-slate-700 font-medium">{lead.customerName ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <Badge bg={colors.bg} text={colors.text}>
                    {LEAD_STATUS_LABELS[lead.status]}
                  </Badge>
                </dd>
              </div>
              {lead.winProbability != null && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Winning probability</dt>
                  <dd>
                    <Badge bg={winProbabilityColor(lead.winProbability).bg} text={winProbabilityColor(lead.winProbability).text}>
                      {lead.winProbability}%
                    </Badge>
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Source</dt>
                <dd className="text-slate-700">{LEAD_SOURCE_LABELS[lead.source]}</dd>
              </div>
              {lead.equipmentType && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Equipment</dt>
                  <dd className="text-slate-700">{EQUIPMENT_TYPE_LABELS[lead.equipmentType]}</dd>
                </div>
              )}
              {lead.endUseSegment && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Segment</dt>
                  <dd className="text-slate-700">{END_USE_SEGMENT_LABELS[lead.endUseSegment]}</dd>
                </div>
              )}
              {lead.competitorBrand && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Competing brand</dt>
                  <dd className="text-slate-700">{lead.competitorBrand}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Value</dt>
                <dd className="text-slate-700">{lead.value ? formatCurrency(lead.value) : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Email</dt>
                <dd className="text-slate-700 truncate max-w-[160px]">{lead.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Phone</dt>
                <dd className="text-slate-700">{lead.phone ?? "—"}</dd>
              </div>
              {lead.account && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Account</dt>
                  <dd>
                    <Link href={`/accounts/${lead.account.id}`} className="text-indigo-600 hover:text-indigo-700">
                      {lead.account.name}
                    </Link>
                  </dd>
                </div>
              )}
              {lead.contact && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Contact</dt>
                  <dd>
                    <Link href={`/contacts/${lead.contact.id}`} className="text-indigo-600 hover:text-indigo-700">
                      {lead.contact.firstName} {lead.contact.lastName}
                    </Link>
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Created</dt>
                <dd className="text-slate-700">{formatDate(lead.createdAt)}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Owner</h2>
            <div className="flex items-center gap-3">
              <Avatar name={lead.owner.name} color={lead.owner.avatarColor} size={9} />
              <span className="text-sm text-slate-700">{lead.owner.name}</span>
            </div>
          </Card>

          {lead.notes && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-2">Description</h2>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{lead.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
