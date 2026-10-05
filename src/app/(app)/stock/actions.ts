"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireHead, canAccessOwner } from "@/lib/rbac";

export type FormState = { error?: string; ok?: boolean };

function revalidateStock() {
  revalidatePath("/stock");
  revalidatePath("/reorder");
  revalidatePath("/products");
}

function utcDate(raw: string): Date | null {
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pendingOrderSchema = z.object({
  productId: z.string().min(1, "Pick the item."),
  quantity: z.coerce.number().int("Quantity must be a whole number.").positive("Quantity must be at least 1."),
  customerName: z.string().trim().min(1, "Enter the customer's name."),
  note: z.string().trim().optional(),
});

export async function addPendingOrder(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = pendingOrderSchema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    customerName: formData.get("customerName"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };

  await prisma.pendingOrder.create({
    data: {
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      customerName: parsed.data.customerName,
      note: parsed.data.note || null,
      paymentReceived: formData.get("paymentReceived") === "on",
      ownerId: user.id,
    },
  });
  revalidateStock();
  return { ok: true };
}

async function loadOwnPendingOrder(id: string) {
  const user = await requireUser();
  const order = await prisma.pendingOrder.findUnique({ where: { id }, select: { ownerId: true } });
  if (!order || !canAccessOwner(user, order.ownerId)) throw new Error("Not allowed.");
}

export async function setPendingOrderPaid(id: string, paymentReceived: boolean) {
  await loadOwnPendingOrder(id);
  await prisma.pendingOrder.update({ where: { id }, data: { paymentReceived } });
  revalidateStock();
}

export async function setPendingOrderStatus(id: string, status: "OPEN" | "FULFILLED" | "CANCELLED") {
  await loadOwnPendingOrder(id);
  await prisma.pendingOrder.update({
    where: { id },
    data: { status, fulfilledAt: status === "FULFILLED" ? new Date() : null },
  });
  revalidateStock();
}

const stockReceiptSchema = z.object({
  productId: z.string().min(1, "Pick the item."),
  quantity: z.coerce.number().int("Quantity must be a whole number.").positive("Quantity must be at least 1."),
  receivedAt: z.string().min(1, "Enter the date the units entered stock."),
  dealerPrice: z.union([z.literal(""), z.coerce.number().positive("Dealer's price must be more than 0.")]).optional(),
  note: z.string().trim().optional(),
});

export async function addStockReceipt(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const head = await requireHead();
  const parsed = stockReceiptSchema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    receivedAt: formData.get("receivedAt"),
    dealerPrice: formData.get("dealerPrice") ?? "",
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const receivedAt = utcDate(parsed.data.receivedAt);
  if (!receivedAt) return { error: "Please enter a valid date." };
  const dealerPrice = typeof parsed.data.dealerPrice === "number" ? parsed.data.dealerPrice : null;

  await prisma.stockReceipt.create({
    data: {
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      receivedAt,
      dealerPrice,
      note: parsed.data.note || null,
      createdById: head.id,
    },
  });

  // An updated dealer's price arriving with the stock becomes that month's
  // price entry, so it's the current price everywhere (Products page shows
  // it with VAT; quotes pick it up as the reference price).
  if (dealerPrice != null) {
    const month = new Date(Date.UTC(receivedAt.getUTCFullYear(), receivedAt.getUTCMonth(), 1));
    await prisma.pricelist.upsert({
      where: { productId_month: { productId: parsed.data.productId, month } },
      create: { productId: parsed.data.productId, month, dealerPrice },
      update: { dealerPrice },
    });
    revalidatePath("/pricelist");
  }

  revalidateStock();
  revalidatePath("/deals/new");
  return { ok: true };
}

export async function deleteStockReceipt(id: string) {
  await requireHead();
  await prisma.stockReceipt.delete({ where: { id } });
  revalidateStock();
}
