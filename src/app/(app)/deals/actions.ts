"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireHead, canAccessOwner } from "@/lib/rbac";
import { STAGE_DEFAULT_PROBABILITY } from "@/lib/constants";
import { getLatestPriceByProduct } from "@/lib/pricing";
import { computeDealDiscount } from "@/lib/discount";
import type { DealStage, LostReason, EquipmentType, EndUseSegment, PaymentTerms } from "@prisma/client";

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
  await requireHead();
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
  customerName: z.string().min(1, "Customer name is required"),
  customerPhone: z.string().min(1, "Customer phone is required"),
  stage: z.enum(["QUALIFICATION", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]),
  value: z.coerce.number().min(0),
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
  const ownerId = user.role === "HEAD" ? parsed.ownerId : user.id;
  const lineItems = parseLineItems(formData.get("lineItems") ?? undefined);

  const deal = await prisma.deal.create({
    data: {
      title: parsed.title,
      customerName: parsed.customerName,
      customerPhone: parsed.customerPhone,
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
      createdAt: parseDateInput(parsed.createdAt),
    },
  });

  revalidatePath("/deals");
  redirect(`/deals/${deal.id}`);
}

export async function updateDeal(dealId: string, formData: FormData) {
  const user = await requireUser();
  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this deal.");

  const raw = Object.fromEntries(formData.entries());
  const parsed = dealSchema.parse(raw);
  const ownerId = user.role === "HEAD" ? parsed.ownerId : existing.ownerId;

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      title: parsed.title,
      customerName: parsed.customerName,
      customerPhone: parsed.customerPhone,
      stage: parsed.stage,
      value: parsed.value,
      probability: parsed.probability ?? STAGE_DEFAULT_PROBABILITY[parsed.stage],
      expectedCloseDate: parsed.expectedCloseDate ? new Date(parsed.expectedCloseDate) : null,
      accountId: toNullable(parsed.accountId),
      contactId: toNullable(parsed.contactId),
      ownerId,
      closedAt: parsed.stage === "WON" || parsed.stage === "LOST" ? (existing.closedAt ?? new Date()) : null,
      lostReasonCategory: parsed.stage === "LOST" ? existing.lostReasonCategory : null,
      lostReason: parsed.stage === "LOST" ? existing.lostReason : null,
      equipmentType: toEquipmentType(parsed.equipmentType),
      endUseSegment: toEndUseSegment(parsed.endUseSegment),
      competitorBrand: toNullable(parsed.competitorBrand),
      paymentTerms: toPaymentTerms(parsed.paymentTerms),
      expectedDeliveryDate: parsed.expectedDeliveryDate ? new Date(parsed.expectedDeliveryDate) : null,
      createdAt: parseDateInput(parsed.createdAt),
    },
  });
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
  closedAtOverride?: string
) {
  const user = await requireUser();
  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, include: { items: true } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this deal.");

  if (stage === "WON") {
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
    },
  });
  await syncSaleLineItemsForDeal(dealId);

  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
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
  await syncSaleLineItemsForDeal(dealId);
  await revokeDiscountApproval(dealId);

  revalidatePath(`/deals/${dealId}`);
}

export async function deleteDealLineItem(lineItemId: string, dealId: string) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, deal.ownerId)) throw new Error("You do not have access to this deal.");

  await prisma.dealLineItem.delete({ where: { id: lineItemId } });
  await syncSaleLineItemsForDeal(dealId);
  await revokeDiscountApproval(dealId);

  revalidatePath(`/deals/${dealId}`);
}

export async function approveDealDiscount(dealId: string) {
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

  redirect(`/quote/${dealId}`);
}
