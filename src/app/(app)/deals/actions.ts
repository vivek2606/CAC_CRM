"use server";

import { z } from "zod";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { notifyDiscountIfNeeded, notifyDiscountApproved } from "@/lib/push-events";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner, requireBackOffice, isBackOffice, requireHead, type SessionUser } from "@/lib/rbac";
import { STAGE_DEFAULT_PROBABILITY } from "@/lib/constants";
import { getLatestPriceByProduct } from "@/lib/pricing";
import { computeDealDiscount } from "@/lib/discount";
import { parseTagsInput } from "@/lib/tags";
import { billingCompanyOf, DEFAULT_BILLING_COMPANY } from "@/lib/billing-company";
import { invoiceKey, invoiceTypeOf, type InvoiceType } from "@/lib/invoice-key";
import { saveWonPlan, clearWonPlan } from "@/lib/won-plan";
import { binDeal } from "@/lib/recycle-bin";

// Change log: a note on the deal, by whoever made the change, for changes
// to a won deal's invoice, company, account and products (shown on the
// deal's timeline).
async function logDealChange(dealId: string, authorId: string, text: string) {
  try {
    await prisma.note.create({ data: { body: `✎ ${text}`, authorId, dealId } });
  } catch (e) {
    console.error("logDealChange", e);
  }
}
const naira = (n: number) => `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

// Actions called from the browser return their problem instead of throwing
// it: in production a thrown message is hidden ("Minified React error
// #441"), so the person would never see why something was refused.
export type ActionResult = { error?: string };
async function attempt(run: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await run();
    return {};
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { error: e instanceof Error ? e.message : "Something went wrong - try again." };
  }
}
import type { DealStage, LostReason, EquipmentType, EndUseSegment, PaymentTerms, ContactRole } from "@prisma/client";

function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

// Keeps SaleLineItem (the source for Sales by Category / month / year
// reporting) in sync with a deal's own line items whenever it's WON, and
// clears them out again if the deal is ever moved off WON. Also keeps
// Deal.value itself in sync with the itemized products any time the deal
// is itemized - not just at the moment of winning - so a deal's headline
// value (shown on the Kanban card, pipeline totals, dashboard, etc.) never
// drifts from the qty x rate the rep actually entered for its products.
async function syncSaleLineItemsForDeal(dealId: string) {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { items: true },
  });

  if (deal.items.length > 0) {
    const total = deal.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
    if (total !== deal.value) {
      await prisma.deal.update({ where: { id: dealId }, data: { value: total } });
    }
  }

  // Dashboard, Targets, and Closed Deals all read Deal.value/stage/closedAt
  // directly, so they're already correct at this point regardless of what
  // happens below. Sales by Category is the one report that depends on this
  // derived SaleLineItem data instead - so a failure here must never bubble
  // up and undo (or make the rep think it failed to mark) an otherwise-
  // successful Won/Lost transition. Log it and let resyncCategoryData()
  // below repair the gap on demand instead.
  try {
    if (deal.stage !== "WON" || !deal.closedAt) {
      await prisma.saleLineItem.deleteMany({ where: { dealId } });
      return;
    }

    const docDate = deal.closedAt;
    const month = firstOfMonth(docDate);
    const currentSourceKeys = deal.items.map((item) => `deal-item:${item.id}`);

    await prisma.$transaction([
      prisma.saleLineItem.deleteMany({
        where: { dealId, sourceKey: { notIn: currentSourceKeys.length > 0 ? currentSourceKeys : [""] } },
      }),
      ...deal.items.map((item) =>
        prisma.saleLineItem.upsert({
          where: { sourceKey: `deal-item:${item.id}` },
          create: {
            sourceKey: `deal-item:${item.id}`,
            docDate,
            month,
            qty: item.qty,
            value: item.qty * item.unitPrice,
            productId: item.productId,
            ownerId: deal.ownerId,
            dealId: deal.id,
          },
          update: {
            docDate,
            month,
            qty: item.qty,
            value: item.qty * item.unitPrice,
            productId: item.productId,
            ownerId: deal.ownerId,
          },
        })
      ),
    ]);
  } catch (e) {
    console.error(`syncSaleLineItemsForDeal: failed to sync Sales by Category data for deal ${dealId}`, e);
  }
}

// One-click repair for Sales by Category / Targets' category mix: re-runs
// the sync above for every Won, itemized deal, so any deal whose category
// data fell out of step (the sync above failed partway at some point in the
// past, before it was made non-fatal and transactional) gets picked up
// without needing direct database access.
export async function resyncCategoryData(): Promise<{ checked: number; repaired: number }> {
  await requireBackOffice();
  const deals = await prisma.deal.findMany({
    where: { stage: "WON", items: { some: {} } },
    select: { id: true },
  });
  let repaired = 0;
  for (const deal of deals) {
    const before = await prisma.saleLineItem.count({ where: { dealId: deal.id } });
    await syncSaleLineItemsForDeal(deal.id);
    const after = await prisma.saleLineItem.count({ where: { dealId: deal.id } });
    if (after !== before) repaired++;
  }
  revalidatePath("/reports/sales-register");
  revalidatePath("/targets");
  return { checked: deals.length, repaired };
}

const dealSchema = z.object({
  title: z.string().min(1, "Title is required"),
  // Required for sales managers (checked in requireContact); optional for
  // the Head and Sales Coordinator.
  customerName: z.string().trim().optional().default(""),
  customerPhone: z.string().trim().optional().default(""),
  stage: z.enum(["QUALIFICATION", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]),
  // Can be below 0 when the products include a sales return.
  value: z.coerce.number().finite().transform((v) => Math.round(v * 100) / 100),
  probability: z.coerce.number().min(0).max(100).optional(),
  expectedCloseDate: z.string().optional(),
  accountId: z.string().optional(),
  contactId: z.string().optional(),
  ownerId: z.string().min(1),
  equipmentType: z.string().optional(),
  endUseSegment: z.string().optional(),
  competitorBrand: z.string().optional(),
  paymentTerms: z.string().optional(),
  expectedDeliveryDate: z.string().optional(),
  createdAt: z.string().optional(),
});

function toNullable(value: string | undefined) {
  return value && value.trim() !== "" ? value : null;
}

function toEquipmentType(value: string | undefined): EquipmentType | null {
  return value && value.trim() !== "" ? (value as EquipmentType) : null;
}

function toEndUseSegment(value: string | undefined): EndUseSegment | null {
  return value && value.trim() !== "" ? (value as EndUseSegment) : null;
}

function toPaymentTerms(value: string | undefined): PaymentTerms | null {
  return value && value.trim() !== "" ? (value as PaymentTerms) : null;
}

// Backs both the "Date" entry field (backdating when a deal is logged) and
// the Mark Won/Lost close-date override - falls back to "now" if missing
// or unparseable, matching the previous unconditional `new Date()` behavior.
function requireContact(user: Parameters<typeof isBackOffice>[0], name: string, phone: string) {
  if (isBackOffice(user)) return;
  if (!name) throw new Error("Customer name is required");
  if (!phone) throw new Error("Customer phone is required");
}

function parseDateInput(value: string | undefined): Date {
  if (!value) return new Date();
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

const dealLineItemSchema = z.object({
  productId: z.string().min(1, "Choose a product"),
  // Negative quantity / rate = a sales return.
  qty: z.coerce.number().finite().refine((v) => v !== 0, "Quantity can't be zero"),
  unitPrice: z.coerce.number().finite(),
});

// The New Deal form serializes its optional product rows as a JSON array in
// a hidden "lineItems" field - parse it defensively since it's client-built.
// Invoices from a products sheet uploaded on the deal form (Date / Invoice
// No filled in): the saved deal is then marked Won with them.
const wonInvoicesSchema = z
  .array(
    z.object({
      invoiceNo: z.string().trim().min(1).max(60),
      closedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      billingCompany: z.string().optional(),
      items: z.array(z.object({ productId: z.string().min(1), qty: z.number().finite(), unitPrice: z.number().finite() })).min(1),
    }),
  )
  .max(50);
// [] when there are none; null when they're there but can't be read.
function parseWonInvoices(raw: FormDataEntryValue | null): WonInvoice[] | null {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const r = wonInvoicesSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

// After a save from the deal form: mark it Won with the sheet's invoices.
// A problem (e.g. a discount needing approval) leaves the deal saved and
// says why on its page, where Mark Won can finish it.
async function applySheetInvoices(dealId: string, formData: FormData): Promise<string | null> {
  const invoices = parseWonInvoices(formData.get("wonInvoices"));
  if (invoices === null) return "The invoices in the sheet couldn't be read - check each has an invoice no., a date and a company, then use Mark Won.";
  if (invoices.length === 0) return null;
  try {
    await markDealWonImpl(dealId, invoices);
    return null;
  } catch (e) {
    const error = e instanceof Error ? e.message : "Couldn't mark the deal Won.";
    // Keep the invoices, so Mark Won opens with them once this is sorted.
    await saveWonPlan(dealId, { invoices, error });
    return error;
  }
}

function parseLineItems(raw: FormDataEntryValue | undefined): z.infer<typeof dealLineItemSchema>[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  let items: unknown;
  try {
    items = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => dealLineItemSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export async function createDeal(formData: FormData) {
  const user = await requireUser();
  const raw = Object.fromEntries(formData.entries());
  const parsed = dealSchema.parse(raw);
  requireContact(user, parsed.customerName, parsed.customerPhone);
  const ownerId = isBackOffice(user) ? parsed.ownerId : user.id;
  const lineItems = parseLineItems(formData.get("lineItems") ?? undefined);

  const deal = await prisma.deal.create({
    data: {
      title: parsed.title,
      customerName: toNullable(parsed.customerName),
      customerPhone: toNullable(parsed.customerPhone),
      stage: parsed.stage,
      stageChangedAt: new Date(),
      value: parsed.value,
      probability: parsed.probability ?? STAGE_DEFAULT_PROBABILITY[parsed.stage],
      expectedCloseDate: parsed.expectedCloseDate ? new Date(parsed.expectedCloseDate) : null,
      accountId: toNullable(parsed.accountId),
      contactId: toNullable(parsed.contactId),
      ownerId,
      equipmentType: toEquipmentType(parsed.equipmentType),
      endUseSegment: toEndUseSegment(parsed.endUseSegment),
      competitorBrand: toNullable(parsed.competitorBrand),
      paymentTerms: toPaymentTerms(parsed.paymentTerms),
      expectedDeliveryDate: parsed.expectedDeliveryDate ? new Date(parsed.expectedDeliveryDate) : null,
      items: lineItems.length > 0 ? { createMany: { data: lineItems } } : undefined,
      tags: parseTagsInput(formData.get("tags")),
      createdAt: parseDateInput(parsed.createdAt),
    },
  });
  await syncDealValueFromItems(deal.id);
  if (lineItems.length > 0) await notifyDiscountIfNeeded(deal.id);
  const wonError = await applySheetInvoices(deal.id, formData);

  revalidatePath("/deals");
  redirect(wonError ? `/deals/${deal.id}?wonError=${encodeURIComponent(wonError)}` : `/deals/${deal.id}`);
}

export async function updateDeal(dealId: string, formData: FormData) {
  const user = await requireUser();
  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this deal.");

  const raw = Object.fromEntries(formData.entries());
  const parsed = dealSchema.parse(raw);
  requireContact(user, parsed.customerName, parsed.customerPhone);
  const ownerId = isBackOffice(user) ? parsed.ownerId : existing.ownerId;

  // A Won/Lost deal can only change stage through the dedicated Mark
  // Won/Lost flow on the Kanban board or the deal's own page - there's no
  // "reopen" action. The Edit Deal form's Stage dropdown only ever lists
  // the open pipeline stages, so it has no valid way to represent WON/LOST
  // and will submit whatever it defaulted to. Ignoring the submitted stage
  // (and closedAt/lost-reason) here for an already-closed deal is what
  // stops that from silently reverting it to an open stage - and un-Winning
  // it - just because someone edited an unrelated field like the phone
  // number.
  const isClosed = existing.stage === "WON" || existing.stage === "LOST";
  const stage = isClosed ? existing.stage : parsed.stage;

  // A won deal's invoice no. / company changed here mustn't duplicate another sale.
  if (existing.stage === "WON" && existing.sourceTxnNo == null) {
    const newNo = String(formData.get("invoiceNo") ?? "").trim() || existing.invoiceNo;
    const newCompany = (isBackOffice(user) && billingCompanyOf(String(formData.get("billingCompany") ?? ""))) || existing.billingCompany;
    if (newNo && (newNo !== existing.invoiceNo || newCompany !== existing.billingCompany)) {
      const clash = await invoiceClash([{ invoiceNo: newNo, company: newCompany, type: invoiceTypeOf(existing.value) }], [dealId]);
      if (clash) redirect(`/deals/${dealId}/edit?error=${encodeURIComponent(clash)}`);
    }
  }

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      title: parsed.title,
      customerName: toNullable(parsed.customerName),
      customerPhone: toNullable(parsed.customerPhone),
      stage,
      ...(stage !== existing.stage ? { stageChangedAt: new Date() } : {}),
      value: parsed.value,
      probability: parsed.probability ?? STAGE_DEFAULT_PROBABILITY[stage],
      expectedCloseDate: parsed.expectedCloseDate ? new Date(parsed.expectedCloseDate) : null,
      accountId: toNullable(parsed.accountId),
      contactId: toNullable(parsed.contactId),
      ownerId,
      closedAt: isClosed ? existing.closedAt : null,
      // A won deal's billing company: corrected here by the Head / Coordinator.
      ...(existing.stage === "WON" && isBackOffice(user) && billingCompanyOf(String(formData.get("billingCompany") ?? ""))
        ? { billingCompany: billingCompanyOf(String(formData.get("billingCompany"))) }
        : {}),
      // A won deal's invoice no. can be corrected here (blank keeps it).
      invoiceNo:
        existing.stage === "WON" && typeof formData.get("invoiceNo") === "string" && String(formData.get("invoiceNo")).trim()
          ? String(formData.get("invoiceNo")).trim().slice(0, 60)
          : existing.invoiceNo,
      lostReasonCategory: isClosed ? existing.lostReasonCategory : null,
      lostReason: isClosed ? existing.lostReason : null,
      equipmentType: toEquipmentType(parsed.equipmentType),
      endUseSegment: toEndUseSegment(parsed.endUseSegment),
      competitorBrand: toNullable(parsed.competitorBrand),
      paymentTerms: toPaymentTerms(parsed.paymentTerms),
      expectedDeliveryDate: parsed.expectedDeliveryDate ? new Date(parsed.expectedDeliveryDate) : null,
      tags: parseTagsInput(formData.get("tags")),
      createdAt: parseDateInput(parsed.createdAt),
    },
  });
  // Products edited in the form (sent whenever the form shows the editor).
  if (formData.get("lineItemsPresent") === "1" && existing.sourceTxnNo == null && (existing.stage !== "WON" || isBackOffice(user))) {
    const next = parseLineItems(formData.get("lineItems") ?? undefined).filter((i) => i.qty !== 0);
    const current = await prisma.dealLineItem.findMany({ where: { dealId }, select: { productId: true, qty: true, unitPrice: true } });
    const key = (rows: { productId: string; qty: number; unitPrice: number }[]) =>
      rows.map((r) => `${r.productId}|${r.qty}|${Math.round(r.unitPrice * 100) / 100}`).sort().join(",");
    if (key(next) !== key(current)) {
      if (existing.stage === "WON" && next.length === 0) throw new Error("A won deal needs at least one product billed.");
      if (existing.stage === "WON" && next.some((i) => i.unitPrice === 0)) throw new Error("Every product billed needs a basic rate (negative for a return).");
      await prisma.dealLineItem.deleteMany({ where: { dealId } });
      if (next.length) await prisma.dealLineItem.createMany({ data: next.map((i) => ({ dealId, productId: i.productId, qty: i.qty, unitPrice: i.unitPrice })) });
      await revokeDiscountApproval(dealId);
      await notifyDiscountIfNeeded(dealId);
    }
  }
  await syncDealValueFromItems(dealId);
  await syncSaleLineItemsForDeal(dealId);
  // Change log for a won deal: what changed in its sale.
  if (existing.stage === "WON") {
    const after = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { invoiceNo: true, billingCompany: true, accountId: true, value: true, account: { select: { name: true } } },
    });
    if (after) {
      const changes: string[] = [];
      if (after.invoiceNo !== existing.invoiceNo) changes.push(`invoice no. ${existing.invoiceNo ?? "-"} → ${after.invoiceNo ?? "-"}`);
      if (after.billingCompany !== existing.billingCompany) changes.push(`company ${existing.billingCompany ?? "not recorded"} → ${after.billingCompany ?? "not recorded"}`);
      if (after.accountId !== existing.accountId) changes.push(`account → ${after.account?.name ?? "none"}`);
      if (Math.abs(after.value - existing.value) >= 0.01) changes.push(`value ${naira(existing.value)} → ${naira(after.value)}`);
      if (changes.length) await logDealChange(dealId, user.id, `Edited: ${changes.join("; ")}.`);
    }
  }
  const wonError = await applySheetInvoices(dealId, formData);

  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  redirect(wonError ? `/deals/${dealId}?wonError=${encodeURIComponent(wonError)}` : `/deals/${dealId}`);
}

// Where to go after a delete: back to the page the deal was opened from
// (e.g. Data health) when it says so, else the pipeline.
function safeReturnTo(formData?: FormData): string | null {
  const v = formData?.get("returnTo");
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : null;
}

export async function deleteDeal(dealId: string, formData?: FormData) {
  const user = await requireUser();
  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this deal.");

  // Into the recycle bin first (restorable for 30 days). Its Sales Register
  // lines go with it (they'd otherwise stay counted with no deal), and the
  // lead it came from is open again.
  await binDeal(dealId, user.id);
  await prisma.saleLineItem.deleteMany({ where: { dealId } });
  await prisma.lead.updateMany({ where: { convertedDealId: dealId }, data: { convertedDealId: null, status: "QUALIFIED" } });
  await clearWonPlan(dealId);
  await prisma.deal.delete({ where: { id: dealId } });
  revalidatePath("/deals");
  revalidatePath("/reports/sales-register");
  revalidatePath("/leads");
  revalidatePath("/admin/data-health");
  redirect(safeReturnTo(formData) ?? "/deals");
}

// Head / Coordinator: puts a Won or Lost deal entered in the CRM back in the
// pipeline (Negotiation) - e.g. marked Won or Lost by mistake. Its invoice,
// lost reason and Sales Register lines are cleared; its products stay.
// Deals imported from the Sales Register can be deleted instead.
export async function reopenDeal(dealId: string): Promise<ActionResult> {
  return attempt(() => reopenDealImpl(dealId));
}

async function reopenDealImpl(dealId: string) {
  const user = await requireUser();
  if (!isBackOffice(user)) throw new Error("Only the Head of Sales or the Sales Coordinator can reopen a deal.");
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, select: { stage: true, sourceTxnNo: true } });
  if (deal.sourceTxnNo != null) throw new Error("This deal comes from the Sales Register - delete it instead, or correct it in the ERP and upload again.");
  if (deal.stage !== "WON" && deal.stage !== "LOST") return;
  await prisma.deal.update({
    where: { id: dealId },
    data: {
      stage: "NEGOTIATION",
      stageChangedAt: new Date(),
      probability: STAGE_DEFAULT_PROBABILITY.NEGOTIATION,
      closedAt: null,
      invoiceNo: null,
      billingCompany: null,
      lostReasonCategory: null,
      lostReason: null,
      lostToBrand: null,
    },
  });
  await syncSaleLineItemsForDeal(dealId);
  await logDealChange(dealId, user.id, `Reopened (was ${deal.stage === "WON" ? "Won" : "Lost"}) - back to Negotiation.`);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  revalidatePath("/reports/sales-register");
  revalidatePath("/");
}

export async function updateDealStage(
  dealId: string,
  stage: DealStage,
  lostReasonCategory?: LostReason,
  lostReasonNote?: string,
  // Lets a rep backdate when a deal actually closed (Won or Lost), for a
  // deal they're only now getting around to updating in the CRM. Defaults
  // to today from the Mark Won/Lost dialogs, same as the entry-date field
  // on the forms above.
  closedAtOverride?: string,
  // Required when marking Won - the invoice raised for the deal.
  invoiceNo?: string,
  // Marking Lost: the brand the customer bought instead.
  lostToBrand?: string,
): Promise<ActionResult> {
  return attempt(() => setDealStage(dealId, stage, lostReasonCategory, lostReasonNote, closedAtOverride, invoiceNo, true, lostToBrand));
}

// updateDealStage, minus the discount check when markDealWon has already
// checked the order's discount itself (an order split across invoices is
// checked as a whole, not invoice by invoice). Not exported.
async function setDealStage(
  dealId: string,
  stage: DealStage,
  lostReasonCategory: LostReason | undefined,
  lostReasonNote: string | undefined,
  closedAtOverride: string | undefined,
  invoiceNo: string | undefined,
  checkDiscount: boolean,
  lostToBrand?: string,
) {
  const user = await requireUser();
  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, include: { items: true } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this deal.");

  if (stage === "WON") {
    // The products billed must be recorded - quantity and basic rate.
    if (existing.items.length === 0) throw new Error("Add the products billed (quantity and basic rate) to mark this deal Won.");
    if (existing.items.some((i) => i.qty === 0 || i.unitPrice === 0)) {
      throw new Error("Every product billed needs a quantity and a basic rate (negative for a return).");
    }
    if (!invoiceNo?.trim()) throw new Error("Enter the invoice no. to mark this deal Won.");
    if (!closedAtOverride) throw new Error("Enter the invoice date to mark this deal Won.");
    if (!existing.accountId) {
      throw new Error("Link this deal to an account before marking it Won.");
    }
    const referencePrices = checkDiscount ? await getLatestPriceByProduct() : new Map<string, number>();
    const discount = checkDiscount ? computeDealDiscount(existing.items, referencePrices, existing.discountApprovedAt) : null;
    if (discount?.needsApproval) {
      throw new Error(
        `Discounted ${discount.discountPct.toFixed(1)}% below list price - needs Head approval before this can be marked Won.`
      );
    }
  }

  const isClosed = stage === "WON" || stage === "LOST";

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      stage,
      ...(stage !== existing.stage ? { stageChangedAt: new Date() } : {}),
      probability: STAGE_DEFAULT_PROBABILITY[stage],
      closedAt: isClosed ? parseDateInput(closedAtOverride) : null,
      lostReasonCategory: stage === "LOST" ? (lostReasonCategory ?? existing.lostReasonCategory ?? "OTHER") : null,
      lostReason: stage === "LOST" ? (lostReasonNote ?? null) : null,
      lostToBrand: stage === "LOST" ? lostToBrand?.trim().slice(0, 80) || null : null,
      invoiceNo: stage === "WON" ? invoiceNo!.trim().slice(0, 60) : existing.invoiceNo,
    },
  });
  await syncSaleLineItemsForDeal(dealId);

  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
}

// A deal with products (qty x basic rate) takes their total as its value,
// and so does the lead it came from (its estimated value). With no
// products the value entered by hand stands.
async function syncDealValueFromItems(dealId: string) {
  const items = await prisma.dealLineItem.findMany({ where: { dealId }, select: { qty: true, unitPrice: true } });
  if (items.length === 0) return;
  const value = Math.round(items.reduce((s, i) => s + i.qty * i.unitPrice, 0) * 100) / 100;
  await prisma.deal.update({ where: { id: dealId }, data: { value } });
  await prisma.lead.updateMany({ where: { convertedDealId: dealId }, data: { value } });
}

// Any change to a deal's line items invalidates a standing discount
// approval - it was granted against a specific quoted total, not a
// blanket pass for whatever the deal becomes afterward.
async function revokeDiscountApproval(dealId: string) {
  await prisma.deal.update({
    where: { id: dealId },
    data: { discountApprovedAt: null, discountApprovedById: null },
  });
}

// Once a deal is Won, its products, quantities and rates (and invoices) are
// changed only by the Head of Sales or the Sales Coordinator.
const WON_ITEMS_LOCKED = "Only the Head of Sales or the Sales Coordinator can change a won deal's products, quantities and rates.";
function assertCanEditItems(user: { role: SessionUser["role"] }, stage: DealStage) {
  if (stage === "WON" && !isBackOffice(user)) throw new Error(WON_ITEMS_LOCKED);
}

export async function addDealLineItem(dealId: string, formData: FormData) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, deal.ownerId)) throw new Error("You do not have access to this deal.");
  assertCanEditItems(user, deal.stage);

  const parsed = dealLineItemSchema.parse(Object.fromEntries(formData.entries()));
  if (deal.stage === "WON") {
    const p = await prisma.product.findUnique({ where: { id: parsed.productId }, select: { model: true } });
    await logDealChange(dealId, user.id, `Product added: ${p?.model ?? "product"} - ${parsed.qty} x ${naira(parsed.unitPrice)}.`);
  }

  await prisma.dealLineItem.create({
    data: { dealId, productId: parsed.productId, qty: parsed.qty, unitPrice: parsed.unitPrice },
  });
  await syncDealValueFromItems(dealId);
  await syncSaleLineItemsForDeal(dealId);
  await revokeDiscountApproval(dealId);
  await notifyDiscountIfNeeded(dealId);

  revalidatePath(`/deals/${dealId}`);
}

export async function deleteDealLineItem(lineItemId: string, dealId: string) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, deal.ownerId)) throw new Error("You do not have access to this deal.");
  assertCanEditItems(user, deal.stage);

  const removed = await prisma.dealLineItem.delete({ where: { id: lineItemId }, include: { product: { select: { model: true } } } });
  if (deal.stage === "WON") await logDealChange(dealId, user.id, `Product removed: ${removed.product.model} - ${removed.qty} x ${naira(removed.unitPrice)}.`);
  await syncDealValueFromItems(dealId);
  await syncSaleLineItemsForDeal(dealId);
  await revokeDiscountApproval(dealId);

  revalidatePath(`/deals/${dealId}`);
}

export async function approveDealDiscount(dealId: string) {
  // Approving a discount stays with the Head of Sales only.
  const head = await requireHead();

  await prisma.deal.update({
    where: { id: dealId },
    data: { discountApprovedAt: new Date(), discountApprovedById: head.id },
  });
  await notifyDiscountApproved(dealId);

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
}

// Assigns a stable quote number the first time a quote is generated for
// this deal (idempotent after that), then sends the rep to the printable
// quote page. Retries once on the rare chance two people generate a quote
// number at the same instant.
export async function viewQuote(dealId: string) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, deal.ownerId)) throw new Error("You do not have access to this deal.");

  if (!deal.quoteNumber) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const max = await prisma.deal.aggregate({ _max: { quoteNumber: true } });
      const next = (max._max.quoteNumber ?? 0) + 1;
      try {
        await prisma.deal.update({ where: { id: dealId }, data: { quoteNumber: next } });
        break;
      } catch {
        if (attempt === 2) throw new Error("Could not assign a quote number - try again.");
      }
    }
  }

  redirect(`/quotations?deal=${dealId}`);
}

// Additional stakeholders on a deal (Economic Buyer, Champion, Influencer,
// etc.) beyond its one primary Contact - Salesforce's "Opportunity Contact
// Role." @@unique([dealId, contactId]) on the model means re-adding the
// same contact just changes their role instead of creating a duplicate row.
export async function addDealContactRole(dealId: string, formData: FormData) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, deal.ownerId)) throw new Error("You do not have access to this deal.");

  const contactId = String(formData.get("contactId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!contactId || !role) return;

  await prisma.dealContactRole.upsert({
    where: { dealId_contactId: { dealId, contactId } },
    create: { dealId, contactId, role: role as ContactRole },
    update: { role: role as ContactRole },
  });

  revalidatePath(`/deals/${dealId}`);
}

export async function removeDealContactRole(dealContactRoleId: string, dealId: string) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, deal.ownerId)) throw new Error("You do not have access to this deal.");

  await prisma.dealContactRole.delete({ where: { id: dealContactRoleId } });
  revalidatePath(`/deals/${dealId}`);
}

// Negotiation-stage flag: count this deal's line items toward the next
// Midea factory order if they aren't in stock (see /reorder).
export async function setDealConsiderForReorder(dealId: string, considerForReorder: boolean) {
  const user = await requireUser();
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { ownerId: true, stage: true } });
  if (!deal || !canAccessOwner(user, deal.ownerId)) throw new Error("Not allowed.");
  if (considerForReorder && deal.stage !== "NEGOTIATION") {
    throw new Error("Only a deal in Negotiation can be flagged for future ordering.");
  }
  await prisma.deal.update({ where: { id: dealId }, data: { considerForReorder } });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/reorder");
}

// Add (or correct) the invoice on a deal already won in the CRM - for deals
// marked Won before the invoice was asked for. The invoice date becomes the
// date the sale counts (closedAt), so its line items move with it.
export async function setDealInvoice(dealId: string, invoiceNo: string, invoiceDate: string, company?: string): Promise<ActionResult> {
  return attempt(() => setDealInvoiceImpl(dealId, invoiceNo, invoiceDate, company));
}

async function setDealInvoiceImpl(dealId: string, invoiceNo: string, invoiceDate: string, company?: string) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, select: { ownerId: true, stage: true, sourceTxnNo: true, value: true } });
  if (!canAccessOwner(user, deal.ownerId)) throw new Error("You do not have access to this deal.");
  if (deal.stage !== "WON") throw new Error("Only a won deal has an invoice.");
  if (deal.sourceTxnNo != null) throw new Error("This sale came from the Sales Register - its invoice no. is the register's Txn No.");
  const no = invoiceNo.trim();
  if (!no) throw new Error("Enter the invoice no.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) throw new Error("Enter the invoice date.");
  const billingCompany = billingCompanyOf(company);
  if (!billingCompany) throw new Error("Pick the company that raised the invoice - Sakuragi or Somotex.");
  const clash = await invoiceClash([{ invoiceNo: no, company: billingCompany, type: invoiceTypeOf(deal.value) }], [dealId]);
  if (clash) throw new Error(clash);
  await prisma.deal.update({ where: { id: dealId }, data: { invoiceNo: no.slice(0, 60), closedAt: parseDateInput(invoiceDate), billingCompany } });
  await logDealChange(dealId, user.id, `Invoice no. set: ${no} (${billingCompany}), dated ${invoiceDate}.`);
  await syncSaleLineItemsForDeal(dealId);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/reports/sales-register");
  revalidatePath("/deals");
  revalidatePath("/");
}

// An invoice already recorded on another won deal - entered in the CRM or
// imported from the Sales Register - would count the sale twice. Same
// number, same type (sale / sales return) and the same company (or either
// company not recorded) is a clash; each company numbers its sales and its
// returns separately (see invoice-key.ts). Returns a message naming the
// deal, or null.
async function invoiceClash(
  invoices: { invoiceNo: string; company: string | null; type: InvoiceType }[],
  excludeDealIds: string[],
): Promise<string | null> {
  const nos = [...new Set(invoices.map((i) => i.invoiceNo.trim()).filter(Boolean))];
  if (nos.length === 0) return null;
  const others = await prisma.deal.findMany({
    where: {
      stage: "WON",
      id: { notIn: excludeDealIds },
      OR: [{ invoiceNo: { in: nos, mode: "insensitive" } }, { sourceTxnNo: { in: nos.filter((n) => /^\d+$/.test(n)).map(Number) } }],
    },
    select: { id: true, title: true, value: true, invoiceNo: true, sourceTxnNo: true, billingCompany: true },
  });
  for (const inv of invoices) {
    const no = inv.invoiceNo.trim().toLowerCase();
    const hit = others.find(
      (o) =>
        ((o.invoiceNo ?? "").toLowerCase() === no || String(o.sourceTxnNo ?? "") === no) &&
        invoiceTypeOf(o.value) === inv.type &&
        (!o.billingCompany || !inv.company || o.billingCompany === inv.company),
    );
    if (hit) {
      return `${inv.type === "return" ? "Sales return" : "Invoice"} ${inv.invoiceNo.trim()}${inv.company ? ` (${inv.company})` : ""} is already recorded on "${hit.title}"${
        hit.billingCompany ? ` (${hit.billingCompany})` : ""
      } - entering it again would count the sale twice. Correct that deal instead${
        !hit.billingCompany && inv.company ? `, or if it was billed by the other company, set its Billed by first` : ""
      }.`;
    }
  }
  return null;
}

export type WonInvoice = {
  invoiceNo: string;
  closedAt: string;
  // "Sakuragi" / "Somotex"; blank keeps what the deal has.
  billingCompany?: string;
  items: { productId: string; qty: number; unitPrice: number }[];
};

// Mark Won from the dialog, with the products billed on each invoice. One
// invoice: this deal is won with those products. Several (the order was
// billed on two or more invoices): the first stays on this deal and each
// other invoice becomes its own Won deal - same account, contact, customer,
// owner and details - with its products, value, invoice no. and date.
// Everything is checked before anything is saved.
export async function markDealWon(dealId: string, invoices: WonInvoice[]): Promise<ActionResult> {
  return attempt(() => markDealWonImpl(dealId, invoices));
}

async function markDealWonImpl(dealId: string, invoices: WonInvoice[]) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, include: { items: true } });
  if (!canAccessOwner(user, deal.ownerId)) throw new Error("You do not have access to this deal.");
  if (deal.stage === "LOST") throw new Error("This deal is already closed.");
  if (deal.sourceTxnNo != null) throw new Error("This deal comes from the Sales Register - its lines can't be changed here.");
  // A deal already Won (e.g. won before products were required) can have its
  // invoices and products recorded the same way, split included.
  const alreadyWon = deal.stage === "WON";
  if (alreadyWon) assertCanEditItems(user, deal.stage);
  if (!deal.accountId && !alreadyWon) throw new Error("Link this deal to an account before marking it Won.");

  // ---- validate everything first
  if (invoices.length === 0) throw new Error("Add the invoice.");
  const nos = invoices.map((i) => i.invoiceNo.trim());
  if (nos.some((n) => !n)) throw new Error("Enter the invoice no. for every invoice.");
  // Sakuragi and Somotex number their invoices separately, so the same
  // number can come up once per company.
  const totalOf = (i: WonInvoice) => i.items.reduce((t, x) => t + x.qty * x.unitPrice, 0);
  const keyOf = (i: WonInvoice) => invoiceKey(billingCompanyOf(i.billingCompany), invoiceTypeOf(totalOf(i)), i.invoiceNo);
  if (new Set(invoices.map(keyOf)).size !== invoices.length) {
    throw new Error("Each invoice needs a different invoice no. (the same number is fine once per company, and once as a sale and once as a sales return).");
  }
  if (invoices.some((i) => !/^\d{4}-\d{2}-\d{2}$/.test(i.closedAt))) throw new Error("Enter the invoice date for every invoice.");
  for (const [n, inv] of invoices.entries()) {
    const label = invoices.length > 1 ? ` on invoice ${inv.invoiceNo.trim() || n + 1}` : "";
    if (inv.items.length === 0) throw new Error(`Add the products billed${label}.`);
    if (inv.items.some((i) => !i.productId || !Number.isFinite(i.qty) || !Number.isFinite(i.unitPrice) || i.qty === 0 || i.unitPrice === 0)) {
      throw new Error(`Every product${label} needs a model, a quantity and a basic rate (negative for a return).`);
    }
  }
  // Every invoice says which company raised it, and none is already recorded.
  if (invoices.some((i) => !billingCompanyOf(i.billingCompany) && !deal.billingCompany)) {
    throw new Error("Pick the company (Sakuragi or Somotex) for every invoice.");
  }
  if (alreadyWon && !deal.accountId) throw new Error("Link this deal to an account first (Edit) - every won sale needs its account.");
  const clash = await invoiceClash(
    invoices.map((i) => ({ invoiceNo: i.invoiceNo, company: billingCompanyOf(i.billingCompany) ?? deal.billingCompany, type: invoiceTypeOf(totalOf(i)) })),
    [dealId],
  );
  if (clash) throw new Error(clash);
  const productIds = [...new Set(invoices.flatMap((i) => i.items.map((x) => x.productId)))];
  if ((await prisma.product.count({ where: { id: { in: productIds } } })) !== productIds.length) {
    throw new Error("A product picked no longer exists - pick it again.");
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const norm = (items: WonInvoice["items"]) =>
    items.map((i) => `${i.productId}|${i.qty}|${round2(i.unitPrice)}`).sort().join(",");
  // A standing discount approval holds while the products are the ones
  // approved - on the first invoice, or split across the invoices (the
  // deal's products billed on several invoices); any other change needs a
  // fresh one. The Head marking it Won is the approval.
  const dealItems = norm(deal.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: i.unitPrice })));
  const firstUnchanged = norm(invoices[0].items) === dealItems;
  const allUnchanged = norm(invoices.flatMap((i) => i.items)) === dealItems;
  const approvalHolds = deal.discountApprovedAt != null && (firstUnchanged || allUnchanged);
  const approval: { at: Date; by: string | null } | null = approvalHolds
    ? { at: deal.discountApprovedAt!, by: deal.discountApprovedById }
    : user.role === "HEAD"
      ? { at: new Date(), by: user.id }
      : null;
  const prices = await getLatestPriceByProduct();
  // The deal's own products split across invoices are checked as the one
  // order they are (as on the deal page, where it's approved); anything
  // else invoice by invoice.
  const checks = allUnchanged
    ? [{ label: "", items: invoices.flatMap((i) => i.items) }]
    : invoices.map((inv) => ({ label: invoices.length > 1 ? `Invoice ${inv.invoiceNo.trim()}: ` : "", items: inv.items }));
  for (const c of alreadyWon ? [] : checks) {
    const d = computeDealDiscount(c.items, prices, approval?.at ?? null);
    if (d?.needsApproval) {
      throw new Error(`${c.label}discounted ${d.discountPct.toFixed(1)}% below list price - needs Head approval before it can be marked Won.`);
    }
  }

  // ---- this deal: the first invoice
  const [first, ...rest] = invoices;
  if (!firstUnchanged) {
    await prisma.dealLineItem.deleteMany({ where: { dealId } });
    await prisma.dealLineItem.createMany({ data: first.items.map((i) => ({ dealId, productId: i.productId, qty: i.qty, unitPrice: round2(i.unitPrice) })) });
  }
  if ((approval?.at ?? null) !== deal.discountApprovedAt) {
    await prisma.deal.update({ where: { id: dealId }, data: { discountApprovedAt: approval?.at ?? null, discountApprovedById: approval?.by ?? null } });
  }
  await syncDealValueFromItems(dealId);
  if (alreadyWon) await recordWonInvoice(dealId, first.closedAt, first.invoiceNo);
  else await setDealStage(dealId, "WON", undefined, undefined, first.closedAt, first.invoiceNo.trim(), false);
  const companyOf = (inv: WonInvoice) => billingCompanyOf(inv.billingCompany) ?? deal.billingCompany;
  if (companyOf(first) !== deal.billingCompany) await prisma.deal.update({ where: { id: dealId }, data: { billingCompany: companyOf(first) } });

  // ---- each further invoice: its own Won deal, a copy of this one
  for (const inv of rest) {
    const value = round2(inv.items.reduce((t, i) => t + i.qty * i.unitPrice, 0));
    const copy = await prisma.deal.create({
      data: {
        title: `${deal.title} - ${invoiceTypeOf(totalOf(inv)) === "return" ? "Return" : "Inv"} ${inv.invoiceNo.trim()}${
          invoices.filter((o) => o.invoiceNo.trim().toLowerCase() === inv.invoiceNo.trim().toLowerCase()).length > 1 && companyOf(inv) ? ` (${companyOf(inv)})` : ""
        }`,
        customerName: deal.customerName,
        customerPhone: deal.customerPhone,
        stage: deal.stage,
        stageChangedAt: new Date(),
        value,
        probability: deal.probability,
        expectedCloseDate: deal.expectedCloseDate,
        equipmentType: deal.equipmentType,
        endUseSegment: deal.endUseSegment,
        competitorBrand: deal.competitorBrand,
        paymentTerms: deal.paymentTerms,
        expectedDeliveryDate: deal.expectedDeliveryDate,
        tags: deal.tags,
        ownerId: deal.ownerId,
        accountId: deal.accountId,
        contactId: deal.contactId,
        createdAt: deal.createdAt,
        billingCompany: companyOf(inv),
        discountApprovedAt: approval?.at ?? null,
        discountApprovedById: approval?.by ?? null,
        items: { createMany: { data: inv.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: round2(i.unitPrice) })) } },
      },
    });
    if (alreadyWon) await recordWonInvoice(copy.id, inv.closedAt, inv.invoiceNo);
    else await setDealStage(copy.id, "WON", undefined, undefined, inv.closedAt, inv.invoiceNo.trim(), false);
  }
  if (rest.length > 0) {
    // The lead behind the order is worth the whole order - every invoice.
    const total = round2(invoices.reduce((t, inv) => t + inv.items.reduce((u, i) => u + i.qty * i.unitPrice, 0), 0));
    await prisma.lead.updateMany({ where: { convertedDealId: dealId }, data: { value: total } });
  }
  await clearWonPlan(dealId);
  const invSummary = invoices
    .map((i) => `${i.invoiceNo.trim()} (${companyOf(i) ?? "company not recorded"}) ${i.closedAt}: ${i.items.length} line${i.items.length === 1 ? "" : "s"}, ${naira(i.items.reduce((t, x) => t + x.qty * x.unitPrice, 0))}`)
    .join("; ");
  await logDealChange(dealId, user.id, `${alreadyWon ? "Invoices & products changed" : "Marked Won"} - ${invSummary}${rest.length ? " (each further invoice is its own won deal)" : ""}.`);
  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/reports/sales-register");
  revalidatePath("/");
}

// Sets the invoice no. and date on a deal that is already Won and refreshes
// its Sales Register lines. Not exported - only markDealWon calls it, after
// validating the invoices.
async function recordWonInvoice(dealId: string, closedAt: string, invoiceNo: string) {
  await prisma.deal.update({
    where: { id: dealId },
    data: { stage: "WON", probability: STAGE_DEFAULT_PROBABILITY.WON, closedAt: parseDateInput(closedAt), invoiceNo: invoiceNo.trim().slice(0, 60) },
  });
  await syncSaleLineItemsForDeal(dealId);
}

export type WonSheetRow = { productId: string; label: string; qty: number; unitPrice: number; invoiceNo: string; invoiceDate: string; company: string };

// Reads an uploaded sheet of products billed: Date, Invoice No, Company
// (Sakuragi / Somotex), Item Code, Item Name, Quantity, Rate (Date, Invoice
// No and Company optional - left blank for a deal not billed yet). Products are matched by code, else by name/model;
// unmatched rows are reported rather than created. Rows with an invoice no.
// are grouped into invoices by Mark Won and the deal form.
export async function parseWonItemsSheet(formData: FormData): Promise<{ rows: WonSheetRow[]; problems: string[] }> {
  await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { rows: [], problems: ["Choose a file."] };
  const ExcelJS = (await import("exceljs")).default;
  const { cellValue } = await import("@/lib/import/parse-stock-receipts");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return { rows: [], problems: ["Couldn't read the file - upload an .xlsx sheet."] };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], problems: ["The file has no worksheets."] };
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (headers[i] = String(cellValue(c.value) ?? "").trim().toLowerCase().replace(/\s+/g, " ")));
  const col = (...names: string[]) => headers.findIndex((h) => h != null && names.includes(h));
  const iCode = col("item code", "product code", "code", "item no", "item no.");
  const iModel = col("item name", "model", "product", "product name", "item", "description");
  const iQty = col("quantity", "qty", "qty.");
  const iRate = col("rate", "basic rate", "unit price", "price", "rate (excl. vat)", "dealer price");
  const iInv = col("invoice no", "invoice no.", "invoice number", "inv no", "inv. no.", "invoice", "bill no", "txn no");
  const iDate = col("date", "invoice date", "bill date", "doc date");
  const iCompany = col("company", "company name", "billing company", "entity", "billed by");
  if ((iCode === -1 && iModel === -1) || iQty === -1 || iRate === -1) {
    return { rows: [], problems: ["The sheet needs columns: Item Code (or Item Name), Quantity and Rate - plus Date and Invoice No for billed items."] };
  }
  const products = await prisma.product.findMany({ select: { id: true, code: true, model: true } });
  const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const byCode = new Map(products.map((p) => [p.code.toUpperCase(), p]));
  const byModel = new Map<string, (typeof products)[number]>();
  for (const p of products) if (!byModel.has(norm(p.model))) byModel.set(norm(p.model), p);
  const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  // Excel dates come as dates or serial numbers; typed ones as dd/mm/yyyy,
  // dd-mm-yyyy, yyyy-mm-dd or "12 Sep 2026".
  const toDate = (v: unknown): string | null => {
    if (v == null || v === "") return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : iso(v);
    if (typeof v === "number") return v > 20000 && v < 80000 ? iso(new Date(Math.round((v - 25569) * 86400000))) : null;
    const t = String(v).trim();
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return iso(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
    m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31 ? iso(new Date(Date.UTC(y, +m[2] - 1, +m[1]))) : null;
    }
    const d = new Date(`${t} UTC`);
    return isNaN(d.getTime()) ? null : iso(d);
  };
  const rows: WonSheetRow[] = [];
  const problems: string[] = [];
  const dateOfInvoice = new Map<string, string>();
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const get = (i: number) => (i === -1 ? null : cellValue(row.getCell(i).value));
    const code = String(get(iCode) ?? "").trim();
    const model = String(get(iModel) ?? "").trim();
    if (!code && !model) return;
    const num = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[₦,\s]/g, "")));
    const qty = num(get(iQty));
    const rate = num(get(iRate));
    const p = (code && byCode.get(code.toUpperCase())) || (model && byModel.get(norm(model)));
    if (!p) return void problems.push(`Row ${n}: no product matches "${code || model}"`);
    // Negative quantity or rate = a sales return; zero or blank isn't allowed.
    if (!Number.isFinite(qty) || !Number.isFinite(rate) || qty === 0 || rate === 0) {
      return void problems.push(`Row ${n}: enter a quantity and a rate other than 0 (${p.model})`);
    }
    const rawInv = get(iInv);
    const invoiceNo = rawInv == null ? "" : String(rawInv).trim();
    const rawDate = get(iDate);
    let invoiceDate = toDate(rawDate) ?? "";
    if (rawDate != null && String(rawDate).trim() && !invoiceDate) problems.push(`Row ${n}: couldn't read the date "${String(rawDate)}" - use dd/mm/yyyy`);
    // Company: Sakuragi unless the sheet says otherwise.
    const rawCompany = String(get(iCompany) ?? "").trim();
    const company = rawCompany ? (billingCompanyOf(rawCompany) ?? "") : DEFAULT_BILLING_COMPANY;
    if (rawCompany && !company) problems.push(`Row ${n}: company "${rawCompany}" - use Sakuragi or Somotex`);
    if (invoiceNo) {
      // One date per invoice - an invoice being its company + type (sale /
      // sales return) + number (see invoice-key.ts): the first row's.
      const key = invoiceKey(company, invoiceTypeOf(qty * rate), invoiceNo);
      const known = dateOfInvoice.get(key);
      if (known && invoiceDate && known !== invoiceDate) problems.push(`Row ${n}: invoice ${invoiceNo} has another date above - used ${known}`);
      if (known) invoiceDate = known;
      else if (invoiceDate) dateOfInvoice.set(key, invoiceDate);
    }
    rows.push({ productId: p.id, label: `${p.model} (${p.code})`, qty, unitPrice: Math.round(rate * 100) / 100, invoiceNo, invoiceDate, company });
  });
  // Rows of an invoice whose date was only on a later row.
  for (const r of rows) if (r.invoiceNo && !r.invoiceDate) r.invoiceDate = dateOfInvoice.get(invoiceKey(r.company, invoiceTypeOf(r.qty * r.unitPrice), r.invoiceNo)) ?? "";
  if (rows.some((r) => r.invoiceNo) && rows.some((r) => !r.invoiceNo)) {
    problems.push("Some rows have an invoice no. and some don't - fill in the invoice no. on every row");
  }
  return { rows, problems };
}

// Links a deal (and the lead it came from, if that has no account) to an
// account - an existing one, or one created here from a name and customer
// code. Used from the deal page when it has to have an account, e.g. to be
// marked Won.
export async function linkDealAccount(
  dealId: string,
  input: { accountId: string } | { name: string; code: string; city?: string },
): Promise<{ error?: string; accountId?: string }> {
  const user = await requireUser();
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { ownerId: true } });
  if (!deal || !canAccessOwner(user, deal.ownerId)) return { error: "You do not have access to this deal." };

  let accountId: string;
  if ("accountId" in input) {
    const acc = await prisma.account.findUnique({ where: { id: input.accountId }, select: { id: true } });
    if (!acc) return { error: "Pick an account from the list." };
    accountId = acc.id;
  } else {
    const name = input.name.trim().replace(/\s+/g, " ");
    const code = input.code.trim();
    if (!name) return { error: "Enter the account name." };
    if (!code) return { error: "Enter the customer code (the account code in the ERP)." };
    const clash = await prisma.account.findFirst({
      where: { code: { equals: code, mode: "insensitive" } },
      select: { name: true },
    });
    if (clash) return { error: `Customer code ${code} is already used by "${clash.name}" - pick that account from the list instead.` };
    const sameName = await prisma.account.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { name: true } });
    if (sameName) return { error: `An account named "${sameName.name}" already exists - pick it from the list instead.` };
    const created = await prisma.account.create({
      data: { name, code, city: input.city?.trim() || null, ownerId: deal.ownerId },
      select: { id: true },
    });
    accountId = created.id;
  }

  await prisma.deal.update({ where: { id: dealId }, data: { accountId } });
  await prisma.lead.updateMany({ where: { convertedDealId: dealId, accountId: null }, data: { accountId } });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  revalidatePath("/accounts");
  return { accountId };
}

// Fills a deal's products from a saved quotation linked to it: the lines
// picked from the product list, with their quantity and rate (ex-VAT) -
// custom lines such as installation are left out. Only for a deal still in
// the pipeline; at Mark Won the products can still be changed. With
// onlyIfEmpty, a deal that already has products is left alone. Also links
// the deal to the account named on the quote when it has none and the name
// matches exactly. Returns how many products were set.
export async function applyQuoteToDeal(quoteId: string, onlyIfEmpty = false): Promise<{ count: number; error?: string }> {
  const user = await requireUser();
  const q = await prisma.quotation.findUnique({
    where: { id: quoteId },
    select: { dealId: true, customerName: true, data: true, deal: { select: { id: true, ownerId: true, stage: true, sourceTxnNo: true, accountId: true, _count: { select: { items: true } } } } },
  });
  const deal = q?.deal;
  if (!q || !deal) return { count: 0, error: "This quotation isn't linked to a deal." };
  if (!canAccessOwner(user, deal.ownerId)) return { count: 0, error: "You do not have access to this deal." };
  if (deal.stage === "WON" || deal.stage === "LOST" || deal.sourceTxnNo != null) {
    return { count: 0, error: "This deal is closed - change its products from Invoices & products instead." };
  }
  if (onlyIfEmpty && deal._count.items > 0) return { count: 0 };

  const { documentInputSchema } = await import("@/lib/sales-document");
  const parsed = documentInputSchema.safeParse(q.data);
  if (!parsed.success) return { count: 0, error: "This saved quotation can't be read." };
  const doc = parsed.data;
  const { getCompanySettings } = await import("@/lib/company-profile");
  const vatFactor = doc.vatMode === "inclusive" ? 1 + (await getCompanySettings()).vatRatePct / 100 : 1;
  // Quotes saved before lines carried their product: match the model name.
  const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const products = await prisma.product.findMany({ select: { id: true, model: true } });
  const ids = new Set(products.map((p) => p.id));
  const byModel = new Map<string, string>();
  for (const p of products) if (!byModel.has(norm(p.model))) byModel.set(norm(p.model), p.id);
  const lines = doc.rows
    .filter((r) => r.kind === "item")
    .map((r) => (r.kind === "item" ? { productId: r.productId && ids.has(r.productId) ? r.productId : byModel.get(norm(r.description)), qty: r.qty, rate: r.unitPrice } : null))
    .filter((l): l is { productId: string; qty: number; rate: number } => l != null && Boolean(l.productId) && l.qty > 0 && l.rate > 0)
    .map((l) => ({ dealId: deal.id, productId: l.productId, qty: l.qty, unitPrice: Math.round((l.rate / vatFactor) * 100) / 100 }));
  if (lines.length === 0) return { count: 0, error: onlyIfEmpty ? undefined : "No products from the product list on this quotation (only custom lines)." };

  await prisma.dealLineItem.deleteMany({ where: { dealId: deal.id } });
  await prisma.dealLineItem.createMany({ data: lines });
  await revokeDiscountApproval(deal.id);
  await syncDealValueFromItems(deal.id);
  await notifyDiscountIfNeeded(deal.id);
  if (!deal.accountId && q.customerName.trim()) {
    const acc = await prisma.account.findFirst({ where: { name: { equals: q.customerName.trim(), mode: "insensitive" } }, select: { id: true } });
    if (acc) await prisma.deal.update({ where: { id: deal.id }, data: { accountId: acc.id } });
  }
  revalidatePath(`/deals/${deal.id}`);
  revalidatePath("/deals");
  return { count: lines.length };
}

// Head only: deletes every sale a sales person entered in the CRM (won
// deals, not ones imported from the Sales Register) with an invoice date in
// [from, to] - to clear a muddled month and enter it again. Each goes the
// way deleteDeal does: its Sales Register lines too, and its lead reopened.
export async function deleteCrmSalesInPeriod(ownerId: string, from: string, to: string): Promise<{ deleted: number; error?: string }> {
  let deleted = 0;
  const res = await attempt(async () => {
    deleted = (await deleteCrmSalesInPeriodImpl(ownerId, from, to)).deleted;
  });
  return { deleted, ...res };
}

async function deleteCrmSalesInPeriodImpl(ownerId: string, from: string, to: string): Promise<{ deleted: number }> {
  const head = await requireHead();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("Pick the period.");
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000);
  const deals = await prisma.deal.findMany({
    where: { ownerId, stage: "WON", sourceTxnNo: null, closedAt: { gte: start, lt: end } },
    select: { id: true },
  });
  const ids = deals.map((d) => d.id);
  if (ids.length === 0) return { deleted: 0 };
  for (const id of ids) await binDeal(id, head.id);
  await prisma.saleLineItem.deleteMany({ where: { dealId: { in: ids } } });
  await prisma.lead.updateMany({ where: { convertedDealId: { in: ids } }, data: { convertedDealId: null, status: "QUALIFIED" } });
  await prisma.appSetting.deleteMany({ where: { key: { in: ids.map((id) => `won-plan:${id}`) } } });
  await prisma.deal.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/reports/sales-register");
  revalidatePath("/deals");
  revalidatePath("/leads");
  revalidatePath("/");
  return { deleted: ids.length };
}

// Sales Register lines entered in the CRM whose deal was deleted (before
// deleting a deal took its lines with it): they'd stay counted with no
// account, company or link. Cleared whenever the register is opened.
export async function clearOrphanCrmLines(): Promise<void> {
  await prisma.saleLineItem.deleteMany({ where: { dealId: null, sourceKey: { startsWith: "deal-item:" } } });
}

// Head only: deletes Sales Register lines with no deal behind them (e.g. an
// imported invoice whose deal was deleted) for the period, optionally for
// one sales person.
export async function deleteOrphanLinesInPeriod(ownerId: string | null, from: string, to: string): Promise<{ deleted: number; error?: string }> {
  let deleted = 0;
  const res = await attempt(async () => {
    deleted = (await deleteOrphanLinesInPeriodImpl(ownerId, from, to)).deleted;
  });
  return { deleted, ...res };
}

async function deleteOrphanLinesInPeriodImpl(ownerId: string | null, from: string, to: string): Promise<{ deleted: number }> {
  await requireHead();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("Pick the period.");
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000);
  const res = await prisma.saleLineItem.deleteMany({ where: { dealId: null, docDate: { gte: start, lt: end }, ...(ownerId ? { ownerId } : {}) } });
  revalidatePath("/reports/sales-register");
  revalidatePath("/");
  return { deleted: res.count };
}

// Head / Coordinator: sets a won deal's billing company (e.g. from Data
// health), checked against invoices already recorded and noted in its
// change log.
export async function setDealCompany(dealId: string, company: string): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireUser();
    if (!isBackOffice(user)) throw new Error("Only the Head of Sales or the Sales Coordinator can change the billing company.");
    const billingCompany = billingCompanyOf(company);
    if (!billingCompany) throw new Error("Pick Sakuragi or Somotex.");
    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, select: { stage: true, invoiceNo: true, value: true, billingCompany: true } });
    if (deal.stage !== "WON") throw new Error("Only a won deal has a billing company.");
    if (deal.billingCompany === billingCompany) return;
    if (deal.invoiceNo) {
      const clash = await invoiceClash([{ invoiceNo: deal.invoiceNo, company: billingCompany, type: invoiceTypeOf(deal.value) }], [dealId]);
      if (clash) throw new Error(clash);
    }
    await prisma.deal.update({ where: { id: dealId }, data: { billingCompany } });
    await logDealChange(dealId, user.id, `Billing company: ${deal.billingCompany ?? "not recorded"} → ${billingCompany}.`);
    revalidatePath("/admin/data-health");
    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/reports/sales-register");
  });
}
