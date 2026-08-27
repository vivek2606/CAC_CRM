"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { STAGE_DEFAULT_PROBABILITY } from "@/lib/constants";
import type { DealStage, LostReason } from "@prisma/client";

function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

// Keeps SaleLineItem (the source for Sales by Category / month / year
// reporting) in sync with a deal's own line items whenever it's WON, and
// clears them out again if the deal is ever moved off WON.
async function syncSaleLineItemsForDeal(dealId: string) {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { items: true },
  });

  if (deal.stage !== "WON" || !deal.closedAt) {
    await prisma.saleLineItem.deleteMany({ where: { dealId } });
    return;
  }

  const docDate = deal.closedAt;
  const month = firstOfMonth(docDate);
  const currentSourceKeys = deal.items.map((item) => `deal-item:${item.id}`);

  await prisma.saleLineItem.deleteMany({
    where: { dealId, sourceKey: { notIn: currentSourceKeys.length > 0 ? currentSourceKeys : [""] } },
  });

  for (const item of deal.items) {
    const sourceKey = `deal-item:${item.id}`;
    await prisma.saleLineItem.upsert({
      where: { sourceKey },
      create: {
        sourceKey,
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
    });
  }

  // If the rep itemized the deal, the itemized total is the true value -
  // keep Deal.value consistent with it at the moment of winning, the same
  // invariant the historical Sales Register import already relies on.
  if (deal.items.length > 0) {
    const total = deal.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
    await prisma.deal.update({ where: { id: dealId }, data: { value: total } });
  }
}

const dealSchema = z.object({
  title: z.string().min(1, "Title is required"),
  stage: z.enum(["QUALIFICATION", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]),
  value: z.coerce.number().min(0),
  probability: z.coerce.number().min(0).max(100).optional(),
  expectedCloseDate: z.string().optional(),
  accountId: z.string().optional(),
  contactId: z.string().optional(),
  ownerId: z.string().min(1),
});

function toNullable(value: string | undefined) {
  return value && value.trim() !== "" ? value : null;
}

export async function createDeal(formData: FormData) {
  const user = await requireUser();
  const raw = Object.fromEntries(formData.entries());
  const parsed = dealSchema.parse(raw);
  const ownerId = user.role === "HEAD" ? parsed.ownerId : user.id;

  const deal = await prisma.deal.create({
    data: {
      title: parsed.title,
      stage: parsed.stage,
      value: parsed.value,
      probability: parsed.probability ?? STAGE_DEFAULT_PROBABILITY[parsed.stage],
      expectedCloseDate: parsed.expectedCloseDate ? new Date(parsed.expectedCloseDate) : null,
      accountId: toNullable(parsed.accountId),
      contactId: toNullable(parsed.contactId),
      ownerId,
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
  lostReasonNote?: string
) {
  const user = await requireUser();
  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this deal.");

  const isClosed = stage === "WON" || stage === "LOST";

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      stage,
      probability: STAGE_DEFAULT_PROBABILITY[stage],
      closedAt: isClosed ? new Date() : null,
      lostReasonCategory: stage === "LOST" ? (lostReasonCategory ?? existing.lostReasonCategory ?? "OTHER") : null,
      lostReason: stage === "LOST" ? (lostReasonNote ?? null) : null,
    },
  });
  await syncSaleLineItemsForDeal(dealId);

  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
}

const dealLineItemSchema = z.object({
  productId: z.string().min(1, "Choose a product"),
  qty: z.coerce.number().positive("Quantity must be greater than zero"),
  unitPrice: z.coerce.number().min(0, "Unit price can't be negative"),
});

export async function addDealLineItem(dealId: string, formData: FormData) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, deal.ownerId)) throw new Error("You do not have access to this deal.");

  const parsed = dealLineItemSchema.parse(Object.fromEntries(formData.entries()));

  await prisma.dealLineItem.create({
    data: { dealId, productId: parsed.productId, qty: parsed.qty, unitPrice: parsed.unitPrice },
  });
  await syncSaleLineItemsForDeal(dealId);

  revalidatePath(`/deals/${dealId}`);
}

export async function deleteDealLineItem(lineItemId: string, dealId: string) {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, deal.ownerId)) throw new Error("You do not have access to this deal.");

  await prisma.dealLineItem.delete({ where: { id: lineItemId } });
  await syncSaleLineItemsForDeal(dealId);

  revalidatePath(`/deals/${dealId}`);
}
