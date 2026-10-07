"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner, requireBackOffice, isBackOffice, requireHead } from "@/lib/rbac";
import { STAGE_DEFAULT_PROBABILITY } from "@/lib/constants";
import { getLatestPriceByProduct } from "@/lib/pricing";
import { computeDealDiscount } from "@/lib/discount";
import { parseTagsInput } from "@/lib/tags";
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
  revalidatePath("/reports/category");
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
  value: z.coerce.number().min(0).transform((v) => Math.round(v * 100) / 100),
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
  qty: z.coerce.number().positive("Quantity must be greater than zero"),
  unitPrice: z.coerce.number().min(0, "Unit price can't be negative"),
});

// The New Deal form serializes its optional product rows as a JSON array in
// a hidden "lineItems" field - parse it defensively since it's client-built.
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

  revalidatePath("/deals");
  redirect(`/deals/${deal.id}`);
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

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      title: parsed.title,
      customerName: toNullable(parsed.customerName),
      customerPhone: toNullable(parsed.customerPhone),
      stage,
      value: parsed.value,
      probability: parsed.probability ?? STAGE_DEFAULT_PROBABILITY[stage],
      expectedCloseDate: parsed.expectedCloseDate ? new Date(parsed.expectedCloseDate) : null,
      accountId: toNullable(parsed.accountId),
      contactId: toNullable(parsed.contactId),
      ownerId,
      closedAt: isClosed ? existing.closedAt : null,
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
  if (formData.get("lineItemsPresent") === "1" && existing.sourceTxnNo == null) {
    const next = parseLineItems(formData.get("lineItems") ?? undefined).filter((i) => i.qty > 0);
    const current = await prisma.dealLineItem.findMany({ where: { dealId }, select: { productId: true, qty: true, unitPrice: true } });
    const key = (rows: { productId: string; qty: number; unitPrice: number }[]) =>
      rows.map((r) => `${r.productId}|${r.qty}|${Math.round(r.unitPrice * 100) / 100}`).sort().join(",");
    if (key(next) !== key(current)) {
      if (existing.stage === "WON" && next.length === 0) throw new Error("A won deal needs at least one product billed.");
      if (existing.stage === "WON" && next.some((i) => !(i.unitPrice > 0))) throw new Error("Every product billed needs a basic rate above 0.");
      await prisma.dealLineItem.deleteMany({ where: { dealId } });
      if (next.length) await prisma.dealLineItem.createMany({ data: next.map((i) => ({ dealId, productId: i.productId, qty: i.qty, unitPrice: i.unitPrice })) });
      await revokeDiscountApproval(dealId);
    }
  }
  await syncDealValueFromItems(dealId);
  await syncSaleLineItemsForDeal(dealId);

  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}

export async function deleteDeal(dealId: string) {
  const user = await requireUser();
  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this deal.");

  await prisma.deal.delete({ where: { id: dealId } });
  revalidatePath("/deals");
  redirect("/deals");
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
  invoiceNo?: string
) {
  const user = await requireUser();
  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, include: { items: true } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this deal.");

  if (stage === "WON") {
    // The products billed must be recorded - quantity and basic rate.
    if (existing.items.length === 0) throw new Error("Add the products billed (quantity and basic rate) to mark this deal Won.");
    if (existing.items.some((i) => !(i.qty > 0) || !(i.unitPrice > 0))) {
      throw new Error("Every product billed needs a quantity and a basic rate above 0.");
    }
    if (!invoiceNo?.trim()) throw new Error("Enter the invoice no. to mark this deal Won.");
    if (!closedAtOverride) throw new Error("Enter the invoice date to mark this deal Won.");
    if (!existing.accountId) {
      throw new Error("Link this deal to an account before marking it Won.");
    }
    const referencePrices = await getLatestPriceByProduct();
    const discount = computeDealDiscount(existing.items, referencePrices, existing.discountApprovedAt);
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
      probability: STAGE_DEFAULT_PROBABILITY[stage],
      closedAt: isClosed ? parseDateInput(closedAtOverride) : null,
      lostReasonCategory: stage === "LOST" ? (lostReasonCategory ?? existing.lostReasonCategory ?? "OTHER") : null,
      lostReason: stage === "LOST" ? (lostReasonNote ?? null) : null,
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

export async function addDealLineItem(dealId: string, formData: FormData) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, deal.ownerId)) throw new Error("You do not have access to this deal.");

  const parsed = dealLineItemSchema.parse(Object.fromEntries(formData.entries()));

  await prisma.dealLineItem.create({
    data: { dealId, productId: parsed.productId, qty: parsed.qty, unitPrice: parsed.unitPrice },
  });
  await syncDealValueFromItems(dealId);
  await syncSaleLineItemsForDeal(dealId);
  await revokeDiscountApproval(dealId);

  revalidatePath(`/deals/${dealId}`);
}

export async function deleteDealLineItem(lineItemId: string, dealId: string) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, deal.ownerId)) throw new Error("You do not have access to this deal.");

  await prisma.dealLineItem.delete({ where: { id: lineItemId } });
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
export async function setDealInvoice(dealId: string, invoiceNo: string, invoiceDate: string) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, select: { ownerId: true, stage: true, sourceTxnNo: true } });
  if (!canAccessOwner(user, deal.ownerId)) throw new Error("You do not have access to this deal.");
  if (deal.stage !== "WON") throw new Error("Only a won deal has an invoice.");
  if (deal.sourceTxnNo != null) throw new Error("This sale came from the Sales Register - its invoice no. is the register's Txn No.");
  const no = invoiceNo.trim();
  if (!no) throw new Error("Enter the invoice no.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) throw new Error("Enter the invoice date.");
  await prisma.deal.update({ where: { id: dealId }, data: { invoiceNo: no.slice(0, 60), closedAt: parseDateInput(invoiceDate) } });
  await syncSaleLineItemsForDeal(dealId);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/reports/sales-register");
  revalidatePath("/deals");
  revalidatePath("/");
}

export type WonInvoice = { invoiceNo: string; closedAt: string; items: { productId: string; qty: number; unitPrice: number }[] };

// Mark Won from the dialog, with the products billed on each invoice. One
// invoice: this deal is won with those products. Several (the order was
// billed on two or more invoices): the first stays on this deal and each
// other invoice becomes its own Won deal - same account, contact, customer,
// owner and details - with its products, value, invoice no. and date.
// Everything is checked before anything is saved.
export async function markDealWon(dealId: string, invoices: WonInvoice[]) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, include: { items: true } });
  if (!canAccessOwner(user, deal.ownerId)) throw new Error("You do not have access to this deal.");
  if (deal.stage === "LOST") throw new Error("This deal is already closed.");
  if (deal.sourceTxnNo != null) throw new Error("This deal comes from the Sales Register - its lines can't be changed here.");
  // A deal already Won (e.g. won before products were required) can have its
  // invoices and products recorded the same way, split included.
  const alreadyWon = deal.stage === "WON";
  if (!deal.accountId && !alreadyWon) throw new Error("Link this deal to an account before marking it Won.");

  // ---- validate everything first
  if (invoices.length === 0) throw new Error("Add the invoice.");
  const nos = invoices.map((i) => i.invoiceNo.trim());
  if (nos.some((n) => !n)) throw new Error("Enter the invoice no. for every invoice.");
  if (new Set(nos.map((n) => n.toLowerCase())).size !== nos.length) throw new Error("Each invoice needs a different invoice no.");
  if (invoices.some((i) => !/^\d{4}-\d{2}-\d{2}$/.test(i.closedAt))) throw new Error("Enter the invoice date for every invoice.");
  for (const [n, inv] of invoices.entries()) {
    const label = invoices.length > 1 ? ` on invoice ${inv.invoiceNo.trim() || n + 1}` : "";
    if (inv.items.length === 0) throw new Error(`Add the products billed${label}.`);
    if (inv.items.some((i) => !i.productId || !(i.qty > 0) || !(i.unitPrice > 0))) {
      throw new Error(`Every product${label} needs a model, a quantity and a basic rate above 0.`);
    }
  }
  const productIds = [...new Set(invoices.flatMap((i) => i.items.map((x) => x.productId)))];
  if ((await prisma.product.count({ where: { id: { in: productIds } } })) !== productIds.length) {
    throw new Error("A product picked no longer exists - pick it again.");
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const norm = (items: WonInvoice["items"]) =>
    items.map((i) => `${i.productId}|${i.qty}|${round2(i.unitPrice)}`).sort().join(",");
  // Unchanged products keep a standing discount approval; any change needs a fresh one.
  const firstUnchanged = norm(invoices[0].items) === norm(deal.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: i.unitPrice })));
  const approvedAt = deal.discountApprovedAt;
  const prices = await getLatestPriceByProduct();
  for (const [n, inv] of alreadyWon ? [] : invoices.entries()) {
    const approval = n === 0 ? (firstUnchanged ? approvedAt : null) : approvedAt && firstUnchanged ? approvedAt : null;
    const d = computeDealDiscount(inv.items, prices, approval);
    if (d?.needsApproval) {
      throw new Error(
        `${invoices.length > 1 ? `Invoice ${inv.invoiceNo.trim()}: ` : ""}discounted ${d.discountPct.toFixed(1)}% below list price - needs Head approval before it can be marked Won.`,
      );
    }
  }

  // ---- this deal: the first invoice
  const [first, ...rest] = invoices;
  if (!firstUnchanged) {
    await prisma.dealLineItem.deleteMany({ where: { dealId } });
    await prisma.dealLineItem.createMany({ data: first.items.map((i) => ({ dealId, productId: i.productId, qty: i.qty, unitPrice: round2(i.unitPrice) })) });
    await prisma.deal.update({ where: { id: dealId }, data: { discountApprovedAt: null, discountApprovedById: null } });
  }
  await syncDealValueFromItems(dealId);
  if (alreadyWon) await recordWonInvoice(dealId, first.closedAt, first.invoiceNo);
  else await updateDealStage(dealId, "WON", undefined, undefined, first.closedAt, first.invoiceNo.trim());

  // ---- each further invoice: its own Won deal, a copy of this one
  for (const inv of rest) {
    const value = round2(inv.items.reduce((t, i) => t + i.qty * i.unitPrice, 0));
    const copy = await prisma.deal.create({
      data: {
        title: `${deal.title} - Inv ${inv.invoiceNo.trim()}`,
        customerName: deal.customerName,
        customerPhone: deal.customerPhone,
        stage: deal.stage,
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
        discountApprovedAt: approvedAt && firstUnchanged ? approvedAt : null,
        discountApprovedById: approvedAt && firstUnchanged ? deal.discountApprovedById : null,
        items: { createMany: { data: inv.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: round2(i.unitPrice) })) } },
      },
    });
    if (alreadyWon) await recordWonInvoice(copy.id, inv.closedAt, inv.invoiceNo);
    else await updateDealStage(copy.id, "WON", undefined, undefined, inv.closedAt, inv.invoiceNo.trim());
  }
  if (rest.length > 0) {
    // The lead behind the order is worth the whole order - every invoice.
    const total = round2(invoices.reduce((t, inv) => t + inv.items.reduce((u, i) => u + i.qty * i.unitPrice, 0), 0));
    await prisma.lead.updateMany({ where: { convertedDealId: dealId }, data: { value: total } });
  }
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

export type WonSheetRow = { productId: string; label: string; qty: number; unitPrice: number };

// Reads an uploaded sheet of products billed (Product Code and/or Model,
// Qty, Rate) for the Mark Won dialog. Products are matched by code, else by
// model; unmatched rows are reported rather than created.
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
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (headers[i] = String(cellValue(c.value) ?? "").trim().toLowerCase()));
  const col = (...names: string[]) => headers.findIndex((h) => h != null && names.includes(h));
  const iCode = col("product code", "item code", "code");
  const iModel = col("model", "product", "item name", "description");
  const iQty = col("qty", "quantity");
  const iRate = col("rate", "basic rate", "unit price", "price", "rate (excl. vat)", "dealer price");
  if ((iCode === -1 && iModel === -1) || iQty === -1 || iRate === -1) {
    return { rows: [], problems: ["The sheet needs columns: Product Code (or Model), Qty and Rate."] };
  }
  const products = await prisma.product.findMany({ select: { id: true, code: true, model: true } });
  const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const byCode = new Map(products.map((p) => [p.code.toUpperCase(), p]));
  const byModel = new Map<string, (typeof products)[number]>();
  for (const p of products) if (!byModel.has(norm(p.model))) byModel.set(norm(p.model), p);
  const rows: WonSheetRow[] = [];
  const problems: string[] = [];
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
    if (!(qty > 0) || !(rate > 0)) return void problems.push(`Row ${n}: quantity and rate must be above 0 (${p.model})`);
    rows.push({ productId: p.id, label: `${p.model} (${p.code})`, qty, unitPrice: Math.round(rate * 100) / 100 });
  });
  return { rows, problems };
}
