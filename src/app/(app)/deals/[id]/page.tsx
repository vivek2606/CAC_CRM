import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { PageHeader, Card, Badge, Avatar } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { DEAL_STAGE_LABELS, DEAL_STAGE_COLORS, LOST_REASON_LABELS } from "@/lib/constants";
import { NotesSection } from "../../notes-section";
import { ActivitiesSection } from "../../activities-section";
import { deleteDeal } from "../actions";
import { StageActions } from "../stage-actions";
import { DealItemsSection } from "../deal-items-section";
import { Pencil, Trash2 } from "lucide-react";

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, avatarColor: true } },
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      activities: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true, avatarColor: true } } } },
      sourceLead: { select: { id: true, title: true } },
      items: { orderBy: { createdAt: "asc" }, include: { product: { select: { code: true, model: true, category: true } } } },
    },
  });

  if (!deal) notFound();
  if (!canAccessOwner(user, deal.ownerId)) redirect("/deals");

  const colors = DEAL_STAGE_COLORS[deal.stage];
  const deleteAction = deleteDeal.bind(null, deal.id);

  const [products, recentPrices] = await Promise.all([
    prisma.product.findMany({ orderBy: { model: "asc" }, select: { id: true, code: true, model: true } }),
    prisma.pricelist.findMany({ orderBy: { month: "desc" }, select: { productId: true, landedPrice: true, dealerPrice: true } }),
  ]);
  const latestPriceByProduct = new Map<string, number>();
  for (const p of recentPrices) {
    if (!latestPriceByProduct.has(p.productId)) {
      latestPriceByProduct.set(p.productId, p.landedPrice ?? p.dealerPrice);
    }
  }
  const productOptions = products.map((p) => ({
    id: p.id,
    label: `${p.model} (${p.code})`,
    defaultPrice: latestPriceByProduct.get(p.id) ?? null,
  }));

  return (
    <div>
      <PageHeader
        title={deal.title}
        description={deal.account?.name ?? undefined}
        action={
          <div className="flex items-center gap-2">
            <StageActions dealId={deal.id} stage={deal.stage} />
            <Link
              href={`/deals/${deal.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
            <form action={deleteAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-slate-500 text-sm font-medium px-3 py-2 transition-colors"
                aria-label="Delete deal"
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
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Products</h2>
            <p className="text-xs text-slate-400 mb-3">
              What&apos;s being quoted on this deal. Feeds Sales by Category once it&apos;s won.
            </p>
            <DealItemsSection dealId={deal.id} items={deal.items} products={productOptions} />
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Activities</h2>
            <ActivitiesSection
              activities={deal.activities}
              target={{ dealId: deal.id, ownerId: deal.ownerId }}
              path={`/deals/${deal.id}`}
            />
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Notes</h2>
            <NotesSection notes={deal.notes} target={{ dealId: deal.id }} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Stage</dt>
                <dd>
                  <Badge bg={colors.bg} text={colors.text}>
                    {DEAL_STAGE_LABELS[deal.stage]}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Value</dt>
                <dd className="text-slate-700 font-medium">{formatCurrency(deal.value)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Probability</dt>
                <dd className="text-slate-700">{deal.probability}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Expected close</dt>
                <dd className="text-slate-700">{formatDate(deal.expectedCloseDate)}</dd>
              </div>
              {deal.closedAt && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Closed on</dt>
                  <dd className="text-slate-700">{formatDate(deal.closedAt)}</dd>
                </div>
              )}
              {deal.lostReasonCategory && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Lost reason</dt>
                  <dd className="text-rose-600 text-right max-w-[160px]">
                    {LOST_REASON_LABELS[deal.lostReasonCategory]}
                    {deal.lostReason && <span className="block text-xs text-slate-400 font-normal">{deal.lostReason}</span>}
                  </dd>
                </div>
              )}
              {deal.account && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Account</dt>
                  <dd>
                    <Link href={`/accounts/${deal.account.id}`} className="text-indigo-600 hover:text-indigo-700">
                      {deal.account.name}
                    </Link>
                  </dd>
                </div>
              )}
              {deal.contact && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Contact</dt>
                  <dd>
                    <Link href={`/contacts/${deal.contact.id}`} className="text-indigo-600 hover:text-indigo-700">
                      {deal.contact.firstName} {deal.contact.lastName}
                    </Link>
                  </dd>
                </div>
              )}
              {deal.sourceLead && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Converted from</dt>
                  <dd>
                    <Link href={`/leads/${deal.sourceLead.id}`} className="text-indigo-600 hover:text-indigo-700">
                      Lead
                    </Link>
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Created</dt>
                <dd className="text-slate-700">{formatDate(deal.createdAt)}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Owner</h2>
            <div className="flex items-center gap-3">
              <Avatar name={deal.owner.name} color={deal.owner.avatarColor} size={9} />
              <span className="text-sm text-slate-700">{deal.owner.name}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
