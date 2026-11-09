import Link from "next/link";
import { getOrderInvoices } from "@/lib/order-invoices";
import { OrderInvoicesCard } from "@/components/order-invoices-card";
import { HistoryCard } from "@/components/history-card";
import { NOT_DRAFT, attachAccounts } from "@/lib/saved-quotes";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner, visibleOwnerIds, isBackOffice, canDownloadQuoteExcel } from "@/lib/rbac";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { getLatestPriceByProduct, getAvailableStockByProduct, getQuotableProducts, getInTransitByProduct, inTransitLabel } from "@/lib/pricing";
import { computeDealDiscount } from "@/lib/discount";
import { PageHeader, Card, Badge, Avatar } from "@/components/ui";
import { formatCurrency, formatDate, formatDuration } from "@/lib/format";
import {
  DEAL_STAGE_LABELS,
  DEAL_STAGE_COLORS,
  LOST_REASON_LABELS,
  EQUIPMENT_TYPE_LABELS,
  END_USE_SEGMENT_LABELS,
  PAYMENT_TERMS_LABELS,
  CONTACT_ACTIVITY_TYPES,
} from "@/lib/constants";
import { RecordTimeline } from "../../record-timeline";
import { TagChips } from "@/components/tag-chips";
import { deleteDeal, viewQuote, approveDealDiscount } from "../actions";
import { StageActions } from "../stage-actions";
import { InvoiceEntry } from "../invoice-entry";
import { DealItemsSection } from "../deal-items-section";
import { SaleLineItemsTable } from "../sale-line-items-table";
import { StakeholdersSection } from "../stakeholders-section";
import { ReorderFlag } from "../reorder-flag";
import { getWonPlan } from "@/lib/won-plan";
import { ReopenDealButton } from "../reopen-deal-button";
import { SavedQuotesTable, savedQuoteSelect } from "../../quotations/saved-quotes-table";
import { Pencil, FileText, ShieldCheck } from "lucide-react";
import { canUseService } from "@/lib/service-access";
import { STANDARD_WARRANTY_MONTHS, warrantyUntil } from "@/lib/service";
import { WarrantyTerms } from "../../service/warranty-terms";
import { InstallationHandover } from "../installation-handover";
import { ClosingChecklist, type ChecklistStep } from "../closing-checklist";
import { listReservations } from "../../stock/reservations/data";
import { ReservationTable } from "../../stock/reservations/reservation-table";
import { ReservationRequestForm } from "../../stock/reservations/reservation-ui";
import { INSTALL_LABEL, INSTALL_TONE, quotedWithInstallation, type InstallStatus } from "@/lib/installation";

export default async function DealDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // returnTo: the page the deal was opened from (e.g. Data health) - a
  // delete goes back there.
  searchParams: Promise<{ markWon?: string; wonError?: string; returnTo?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, avatarColor: true } },
      account: { select: { id: true, name: true, address: true, city: true, phone: true } },
      contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
      installationJob: { select: { id: true, ref: true, status: true, scheduledDate: true, team: true, commissionedAt: true, preferredDate: true, cancelReason: true } },
      activities: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true, avatarColor: true } } } },
      sourceLead: { select: { id: true, title: true, createdAt: true } },
      items: { orderBy: { createdAt: "asc" }, include: { product: { select: { code: true, model: true, category: true } } } },
      lineItems: { orderBy: { docDate: "asc" }, include: { product: { select: { code: true, model: true } } } },
      discountApprovedBy: { select: { name: true } },
      contactRoles: {
        orderBy: { createdAt: "asc" },
        include: { contact: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  if (!deal) notFound();
  if (!canAccessOwner(user, deal.ownerId)) redirect("/deals");

  const colors = DEAL_STAGE_COLORS[deal.stage];
  // Invoices from a products sheet still waiting to be applied (Mark Won opens with them).
  const wonPlan = deal.stage !== "WON" && deal.stage !== "LOST" ? await getWonPlan(deal.id) : null;
  // "First contacted" (see Lead detail page for the same idea) - for a
  // capital-goods business where enquiries mostly land directly as a Deal,
  // this is the number that reflects how fast the enquiry actually got a
  // response, not just when the deal record was created.
  const contactActivities = deal.activities.filter((a) => CONTACT_ACTIVITY_TYPES.includes(a.type));
  const firstContactAt =
    contactActivities.length > 0
      ? contactActivities.reduce((min, a) => (a.createdAt < min ? a.createdAt : min), contactActivities[0].createdAt)
      : null;
  const deleteAction = deleteDeal.bind(null, deal.id);
  const viewQuoteAction = viewQuote.bind(null, deal.id);

  const ownerIds = await visibleOwnerIds(user);
  const [products, latestPriceByProduct, availableStockByProduct, inTransitByProduct, contacts, quotations, orderInvoices] = await Promise.all([
    getQuotableProducts(),
    getLatestPriceByProduct(),
    getAvailableStockByProduct({ exceptDealId: deal.id }),
    getInTransitByProduct(),
    prisma.contact.findMany({
      where: { ownerId: { in: ownerIds } },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.quotation.findMany({ where: { dealId: deal.id, ...NOT_DRAFT }, orderBy: { createdAt: "desc" }, select: savedQuoteSelect }).then(attachAccounts),
    getOrderInvoices(deal.id),
  ]);
  // Stock reservations on this deal (and what's free to reserve).
  const reservations = deal.sourceTxnNo == null ? await listReservations({ dealId: deal.id, status: ["REQUESTED", "APPROVED", "REJECTED", "RELEASED", "EXPIRED", "FULFILLED"] }) : [];
  const heldHere = new Map<string, number>();
  for (const r of reservations) if (r.status === "REQUESTED" || r.status === "APPROVED") heldHere.set(r.productId, (heldHere.get(r.productId) ?? 0) + r.qty);
  const freeFor = (productId: string) => Math.max(0, (availableStockByProduct.get(productId) ?? 0) - (heldHere.get(productId) ?? 0));
  const reserveOptions = products.filter((p) => freeFor(p.id) > 0).map((p) => ({ productId: p.id, label: `${p.model} (${p.code})`, free: freeFor(p.id) }));
  const reserveStart = deal.items.filter((i) => freeFor(i.productId) > 0).map((i) => ({ productId: i.productId, label: i.product.model, free: freeFor(i.productId), qty: Math.round(i.qty) }));
  const canReserve = deal.sourceTxnNo == null && deal.stage !== "LOST" && canAccessOwner(user, deal.ownerId);

  // An open deal with a quotation takes its products from the latest one.
  const productQuote =
    deal.stage !== "WON" && deal.stage !== "LOST" && deal.sourceTxnNo == null && quotations.length
      ? [...quotations].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
      : null;
  // Part-billed orders: the order's balance still to bill (awaiting stock).
  const openBalances = await prisma.deal.findMany({
    where: { orderDealId: deal.orderDealId ?? deal.id, isBalance: true, stage: { notIn: ["WON", "LOST"] }, id: { not: deal.id } },
    select: { id: true, title: true, value: true, items: { select: { qty: true, product: { select: { model: true } } } } },
  });
  const balancePending = deal.isBalance
    ? await prisma.pendingOrder.findMany({ where: { dealId: deal.id, status: "OPEN" }, select: { paymentReceived: true } })
    : [];
  // Closing checklist for a won order (entered in the CRM).
  let checklist: ChecklistStep[] | null = null;
  const quotedInstall = deal.stage === "WON" && !deal.installationJob ? await quotedWithInstallation(deal.id) : false;
  if (deal.stage === "WON" && deal.sourceTxnNo == null) {
    const units = await prisma.installedUnit.findMany({ where: { dealId: deal.id }, select: { qty: true, serialNos: true } });
    const totalUnits = units.reduce((t, u) => t + u.qty, 0);
    const knownSerials = units.reduce((t, u) => t + u.serialNos.filter((x) => x.trim()).length, 0);
    const job = deal.installationJob;
    const installs = (job && job.status !== "CANCELLED") || quotedInstall;
    const dmy = (d: Date) => formatDate(d);
    checklist = [
      { key: "invoiced", label: "Invoiced", state: deal.invoiceNo ? "done" : "todo", detail: deal.invoiceNo ? `${deal.invoiceNo}${deal.closedAt ? `, ${dmy(deal.closedAt)}` : ""}` : "add the invoice no. (above)" },
      { key: "account", label: "Account linked", state: deal.account ? "done" : "todo", detail: deal.account ? deal.account.name : "link the customer's account", href: deal.account ? `/accounts/${deal.account.id}` : undefined },
      openBalances.length
        ? { key: "billed", label: "Everything billed", state: "todo", detail: `${openBalances.length} balance order${openBalances.length === 1 ? "" : "s"} waiting for stock`, href: `/deals/${openBalances[0].id}` }
        : { key: "billed", label: "Everything billed", state: "done", detail: "nothing left to bill" },
      { key: "delivered", label: "Delivered", state: deal.deliveredAt ? "done" : "todo", detail: deal.deliveredAt ? `${dmy(deal.deliveredAt)}${deal.deliveryRef ? ` · ${deal.deliveryRef}` : ""}` : "not recorded yet" },
      job
        ? job.status === "CANCELLED"
          ? { key: "installed", label: "Installed", state: "na", detail: `not by us (${job.cancelReason ?? "cancelled"})` }
          : { key: "installed", label: "Installed", state: job.status === "COMMISSIONED" ? "done" : "todo", detail: job.commissionedAt ? `commissioned ${dmy(job.commissionedAt)}` : `${INSTALL_LABEL[job.status as InstallStatus].toLowerCase()} (${job.ref})` }
        : quotedInstall
          ? { key: "installed", label: "Installed", state: "todo", detail: "quoted with installation - hand it over (below)" }
          : { key: "installed", label: "Installed", state: "na", detail: "supply only" },
      totalUnits === 0
        ? { key: "serials", label: "Serial nos.", state: "na", detail: "no products recorded" }
        : installs
          ? { key: "serials", label: "Serial nos.", state: knownSerials >= totalUnits ? "done" : "todo", detail: `${knownSerials} of ${totalUnits} recorded${knownSerials < totalUnits ? " - at commissioning" : ""}` }
          : { key: "serials", label: "Serial nos.", state: "na", detail: `${knownSerials} of ${totalUnits} known - filled in at the first service visit` },
    ];
  }
  const productOptions = products.map((p) => ({
    id: p.id,
    label: `${p.model} (${p.code})`,
    defaultPrice: latestPriceByProduct.get(p.id) ?? null,
    availableQty: availableStockByProduct.get(p.id) ?? null,
    inTransitLabel: inTransitLabel(inTransitByProduct.get(p.id)),
  }));

  const discount = computeDealDiscount(deal.items, latestPriceByProduct, deal.discountApprovedAt);
  // Every account, for linking one when the deal has none (Mark Won).
  const allAccounts =
    !deal.accountId && deal.stage !== "WON" && deal.stage !== "LOST"
      ? await prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } })
      : [];
  // A missing account isn't a block - Mark Won asks for it (pick or create).
  const stageActionsBlockReason = discount?.needsApproval
      ? `Discounted ${discount.discountPct.toFixed(1)}% below list - needs Head approval before this can be marked Won.`
      : null;

  return (
    <div>
      <PageHeader
        title={deal.title}
        description={deal.account?.name ?? undefined}
        action={
          <div className="flex items-center gap-2">
            <StageActions
              dealId={deal.id}
              stage={deal.stage}
              blockWonReason={deal.stage === "WON" ? null : stageActionsBlockReason}
              openWon={sp.markWon === "1" || (Boolean(sp.wonError) && deal.stage !== "WON" && !stageActionsBlockReason)}
              needsAccount={!deal.accountId && deal.stage !== "WON" && deal.stage !== "LOST"}
              accounts={allAccounts.map((a) => ({ id: a.id, label: a.code ? `${a.name} (${a.code})` : a.name }))}
              wonInvoice={
                // Invoices & products of a won deal: Head / Coordinator only.
                deal.stage === "WON" && deal.sourceTxnNo == null && isBackOffice(user)
                  ? { invoiceNo: deal.invoiceNo ?? "", closedAt: deal.closedAt ? deal.closedAt.toISOString().slice(0, 10) : "" }
                  : undefined
              }
              existingItems={deal.items.map((i) => ({ productId: i.productId, label: `${i.product.model} (${i.product.code})`, qty: i.qty, unitPrice: i.unitPrice }))}
              quotedValue={deal.value}
              billingCompany={deal.billingCompany}
              competitorBrand={deal.competitorBrand}
              pendingInvoices={wonPlan?.invoices.map((i) => ({ ...i, billingCompany: i.billingCompany ?? "" }))}
              pendingError={wonPlan?.error}
              products={[
                ...productOptions.map((p) => ({ id: p.id, label: p.label, defaultPrice: p.defaultPrice })),
                // The deal's own products, even ones with no dealer price on file.
                ...deal.items
                  .filter((i, n, all) => !productOptions.some((p) => p.id === i.productId) && all.findIndex((x) => x.productId === i.productId) === n)
                  .map((i) => ({ id: i.productId, label: `${i.product.model} (${i.product.code})`, defaultPrice: null })),
              ]}
            />
            {deal.stage !== "LOST" && (
              <form action={viewQuoteAction}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  Quote / Proforma
                </button>
              </form>
            )}
            <Link
              href={`/deals/${deal.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
            {isBackOffice(user) && (deal.stage === "WON" || deal.stage === "LOST") && deal.sourceTxnNo == null && (
              <ReopenDealButton dealId={deal.id} stage={deal.stage} />
            )}
            <ConfirmDeleteButton
              action={deleteAction}
              returnTo={sp.returnTo?.startsWith("/") && !sp.returnTo.startsWith("//") ? sp.returnTo : undefined}
              label="Delete deal"
              message={
                deal.stage === "WON"
                  ? `Delete "${deal.title}"? It's a won deal - its sales come out of the Sales Register, targets and incentives. This can't be undone.`
                  : `Delete "${deal.title}"? This can't be undone.`
              }
            />
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {deal.isBalance && deal.stage !== "WON" && deal.stage !== "LOST" && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <p>
              <span className="font-semibold">Balance order - awaiting stock.</span> The products not billed when{" "}
              {deal.orderDealId ? (
                <Link href={`/deals/${deal.orderDealId}`} className="font-medium text-indigo-700 hover:underline">
                  the order
                </Link>
              ) : (
                "the order"
              )}{" "}
              was marked Won{balancePending.some((p) => p.paymentReceived) ? " (paid - counted in Reorder Planning)" : ""}. Not achieved until invoiced: when
              the stock arrives, press Mark Won with the invoice; anything still not billed stays as the balance. If the customer no longer wants them, Mark
              Lost.
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
              {deal.items.map((i) => {
                const stock = availableStockByProduct.get(i.productId);
                return (
                  <li key={i.id}>
                    {i.qty} × {i.product.model}:{" "}
                    {stock == null ? (
                      <span className="text-slate-500">stock not tracked</span>
                    ) : stock >= i.qty ? (
                      <span className="font-semibold text-emerald-700">in stock ({stock})</span>
                    ) : (
                      <span className="text-amber-700">{stock} in stock{inTransitByProduct.get(i.productId)?.qty ? `, ${inTransitLabel(inTransitByProduct.get(i.productId))}` : ""}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {openBalances.length > 0 && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <span className="font-semibold">Balance still to bill:</span>{" "}
            {openBalances.map((b, n) => (
              <span key={b.id}>
                {n > 0 && "; "}
                <Link href={`/deals/${b.id}`} className="font-medium text-indigo-700 hover:underline">
                  {b.items.map((i) => `${i.qty} × ${i.product.model}`).join(", ")} ({formatCurrency(b.value)})
                </Link>
              </span>
            ))}{" "}
            - awaiting stock, in the pipeline until invoiced.
          </div>
        )}
        {(deal.stage === "PROPOSAL" || deal.stage === "NEGOTIATION") && deal.items.length === 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>
              <span className="font-semibold">No products on this deal yet.</span> At the {DEAL_STAGE_LABELS[deal.stage]} stage, add the products, quantities
              and rates being quoted - or make the quotation from this deal and its products are picked up.
            </span>
            <span className="ml-auto flex gap-3">
              <Link href={`/deals/${deal.id}/edit#products`} className="font-medium text-indigo-700 hover:underline">
                Add products
              </Link>
              <Link href={`/quotations?deal=${deal.id}`} className="font-medium text-indigo-700 hover:underline">
                Make quotation
              </Link>
            </span>
          </div>
        )}
        {(sp.wonError || wonPlan) && deal.stage !== "WON" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">
              {wonPlan ? `${wonPlan.invoices.length} invoice${wonPlan.invoices.length === 1 ? "" : "s"} from the products sheet waiting to be applied.` : "The deal was saved, but not marked Won."}
            </span>{" "}
            {sp.wonError ?? wonPlan?.error} Once that&apos;s sorted, press Mark Won - the invoices are already filled in.
          </div>
        )}
        {deal.stage === "WON" && deal.closedAt && (await canUseService(user)) && (
          <WarrantyTerms
            dealId={deal.id}
            months={deal.warrantyMonths}
            until={warrantyUntil(deal.closedAt, deal.warrantyMonths ?? STANDARD_WARRANTY_MONTHS).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}
          />
        )}
        {checklist && <ClosingChecklist dealId={deal.id} steps={checklist} delivered={!!deal.deliveredAt} today={new Date().toISOString().slice(0, 10)} />}
        {deal.installationJob ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <span className="font-semibold text-slate-900">Installation {deal.installationJob.ref}</span>
            <Badge bg={INSTALL_TONE[deal.installationJob.status as InstallStatus].bg} text={INSTALL_TONE[deal.installationJob.status as InstallStatus].text}>
              {INSTALL_LABEL[deal.installationJob.status as InstallStatus]}
            </Badge>
            <span className="text-slate-600">
              {deal.installationJob.commissionedAt
                ? `Commissioned ${formatDate(deal.installationJob.commissionedAt)}`
                : deal.installationJob.status === "CANCELLED"
                  ? deal.installationJob.cancelReason
                  : deal.installationJob.scheduledDate
                    ? `Scheduled ${formatDate(deal.installationJob.scheduledDate)}${deal.installationJob.team ? ` · ${deal.installationJob.team}` : ""}`
                    : deal.installationJob.preferredDate
                      ? `Customer prefers ${formatDate(deal.installationJob.preferredDate)} - waiting to be scheduled`
                      : "Waiting to be scheduled"}
            </span>
            {(await canUseService(user)) && (
              <Link href={`/service/installations/${deal.installationJob.id}`} className="ml-auto text-indigo-600 hover:text-indigo-700">
                Open
              </Link>
            )}
          </div>
        ) : (
          deal.stage === "WON" &&
          deal.sourceTxnNo == null && (
            <InstallationHandover
              dealId={deal.id}
              quoted={quotedInstall}
              defaults={{
                contactName: deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName ?? ""}`.trim() : "",
                phone: deal.contact?.phone ?? deal.customerPhone ?? deal.account?.phone ?? "",
                siteAddress: [deal.account?.address, deal.account?.city].filter(Boolean).join(", "),
              }}
            />
          )
        )}
        {deal.stage === "WON" && !deal.invoiceNo && deal.sourceTxnNo == null && deal.closedAt && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">
              <span className="font-semibold">This won deal has no invoice no.</span> Add the invoice raised for it:
            </p>
            <InvoiceEntry dealId={deal.id} closedAt={deal.closedAt.toISOString().slice(0, 10)} billingCompany={deal.billingCompany} />
          </div>
        )}
        {deal.tags.length > 0 && <TagChips tags={deal.tags} />}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Products</h2>
            {deal.sourceTxnNo != null ? (
              <>
                <p className="text-xs text-slate-400 mb-3">
                  Imported from the Sales Register (Invoice #{deal.sourceTxnNo}) - a historical record, not
                  editable here.
                </p>
                <SaleLineItemsTable items={deal.lineItems} />
              </>
            ) : (
              <>
                {productQuote ? (
                  <p className="mb-3 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                    Products and rates come from quotation{" "}
                    <Link href={`/quotations?quote=${productQuote.id}`} className="font-semibold underline">
                      {productQuote.ref}
                    </Link>{" "}
                    (last downloaded {formatDate(productQuote.updatedAt)}). To change them, revise that quotation - the deal follows its latest quotation.
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mb-3">
                    What&apos;s being quoted on this deal. Feeds the Sales Register once it&apos;s won.
                  </p>
                )}
                <DealItemsSection dealId={deal.id} items={deal.items} products={productOptions} readOnly={(deal.stage === "WON" && !isBackOffice(user)) || !!productQuote} />
                {deal.stage === "NEGOTIATION" && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <ReorderFlag
                      dealId={deal.id}
                      checked={deal.considerForReorder}
                      itemCount={deal.items.length}
                      unitCount={deal.items.reduce((s, i) => s + i.qty, 0)}
                    />
                  </div>
                )}
              </>
            )}
          </Card>

          {orderInvoices.length > 1 && <OrderInvoicesCard invoices={orderInvoices} currentId={deal.id} />}

          {quotations.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-slate-400" />
                Quotations ({quotations.length})
              </h2>
              <SavedQuotesTable
                quotes={quotations}
                showDeal={false}
                canExcel={canDownloadQuoteExcel(user)}
                canDelete={user.role === "HEAD"}
                dealProducts={deal.stage !== "WON" && deal.stage !== "LOST" && deal.sourceTxnNo == null ? { hasProducts: deal.items.length > 0 } : undefined}
              />
            </Card>
          )}

          {(reservations.length > 0 || canReserve) && (
            <Card className="p-5">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Stock reservation</h2>
                <Link href="/stock/reservations" className="ml-auto text-xs text-indigo-600 hover:text-indigo-700">
                  All reservations
                </Link>
              </div>
              {reservations.length > 0 && <ReservationTable rows={reservations} viewer={user} showDeal={false} />}
              {canReserve && (
                <div className="mt-3">
                  {reserveOptions.length ? (
                    <ReservationRequestForm dealId={deal.id} start={reserveStart} products={reserveOptions} />
                  ) : (
                    <p className="text-xs text-slate-500">No stock free to reserve.</p>
                  )}
                </div>
              )}
            </Card>
          )}

          {discount && discount.discountPct > 0.5 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-slate-400" />
                Discount
              </h2>
              <p className="text-sm text-slate-600">
                Quoted <span className="font-medium text-slate-800">{discount.discountPct.toFixed(1)}%</span> below list
                price ({formatCurrency(discount.discountAmount)} off {formatCurrency(discount.referenceTotal)}).
              </p>
              {discount.needsApproval ? (
                user.role === "HEAD" ? (
                  <form action={approveDealDiscount.bind(null, deal.id)} className="mt-3">
                    <button
                      type="submit"
                      className="rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium px-3.5 py-2 transition-colors"
                    >
                      Approve discount
                    </button>
                  </form>
                ) : (
                  <p className="mt-2 text-sm text-amber-600 font-medium">Needs Head approval before this can be marked Won.</p>
                )
              ) : deal.discountApprovedAt ? (
                <p className="mt-2 text-sm text-emerald-600">
                  Approved by {deal.discountApprovedBy?.name ?? "Head"} on {formatDate(deal.discountApprovedAt)}.
                </p>
              ) : null}
            </Card>
          )}

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Timeline</h2>
            <RecordTimeline
              notes={deal.notes}
              activities={deal.activities}
              target={{ dealId: deal.id, ownerId: deal.ownerId }}
              path={`/deals/${deal.id}`}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Customer</dt>
                <dd className="text-slate-700 font-medium">{deal.customerName ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Customer phone</dt>
                <dd className="text-slate-700">{deal.customerPhone ?? "—"}</dd>
              </div>
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
              {deal.expectedDeliveryDate && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Expected delivery</dt>
                  <dd className="text-slate-700">{formatDate(deal.expectedDeliveryDate)}</dd>
                </div>
              )}
              {deal.paymentTerms && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Payment terms</dt>
                  <dd className="text-slate-700">{PAYMENT_TERMS_LABELS[deal.paymentTerms]}</dd>
                </div>
              )}
              {deal.equipmentType && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Equipment</dt>
                  <dd className="text-slate-700">{EQUIPMENT_TYPE_LABELS[deal.equipmentType]}</dd>
                </div>
              )}
              {deal.endUseSegment && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Segment</dt>
                  <dd className="text-slate-700">{END_USE_SEGMENT_LABELS[deal.endUseSegment]}</dd>
                </div>
              )}
              {deal.competitorBrand && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Competing brand</dt>
                  <dd className="text-slate-700">{deal.competitorBrand}</dd>
                </div>
              )}
              {deal.closedAt && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Closed on</dt>
                  <dd className="text-slate-700">{formatDate(deal.closedAt)}</dd>
                </div>
              )}
              {deal.stage === "WON" && (deal.invoiceNo || deal.sourceTxnNo != null) && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Invoice no.</dt>
                  <dd className="text-slate-700">{deal.invoiceNo ?? deal.sourceTxnNo}</dd>
                </div>
              )}
              {deal.billingCompany && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Billed by</dt>
                  <dd className="text-slate-700">{deal.billingCompany}</dd>
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
              {deal.lostToBrand && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Lost to</dt>
                  <dd className="text-slate-700">{deal.lostToBrand}</dd>
                </div>
              )}
              {deal.lostToPrice != null && deal.lostToPrice > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Their price</dt>
                  <dd className="text-slate-700">
                    {formatCurrency(deal.lostToPrice)}
                    {deal.value > 0 && (
                      <span className="ml-1 text-xs text-slate-500">
                        (we were {Math.abs(Math.round(((deal.value - deal.lostToPrice) / deal.lostToPrice) * 100))}% {deal.value >= deal.lostToPrice ? "higher" : "lower"})
                      </span>
                    )}
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
              {/* A converted deal's own date is when it was converted; the lead date is the lead's. */}
              <div className="flex justify-between">
                <dt className="text-slate-500">Lead date</dt>
                <dd className="text-slate-700">{formatDate(deal.sourceLead?.createdAt ?? deal.createdAt)}</dd>
              </div>
              {deal.sourceLead && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Converted to deal</dt>
                  <dd className="text-slate-700">{formatDate(deal.createdAt)}</dd>
                </div>
              )}
              {deal.stage !== "WON" && deal.stage !== "LOST" && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">First contacted</dt>
                  <dd className={firstContactAt ? "text-slate-700" : "text-amber-600 font-medium"}>
                    {firstContactAt
                      ? `${formatDuration(firstContactAt.getTime() - deal.createdAt.getTime())} after created`
                      : "Not yet contacted"}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Owner</h2>
            <div className="flex items-center gap-3">
              <Avatar name={deal.owner.name} color={deal.owner.avatarColor} size={9} />
              <span className="text-sm text-slate-700">{deal.owner.name}</span>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Stakeholders</h2>
            <StakeholdersSection dealId={deal.id} stakeholders={deal.contactRoles} contacts={contacts} />
          </Card>

          {user.role === "HEAD" && <HistoryCard entity="deal" id={deal.id} />}
        </div>
        </div>
      </div>
    </div>
  );
}
