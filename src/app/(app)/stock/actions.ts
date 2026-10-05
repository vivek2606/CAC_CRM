"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireHead, canAccessOwner } from "@/lib/rbac";
import { parseStockReceiptsBuffer, type StockReceiptRowProblem } from "@/lib/import/parse-stock-receipts";
import { parseInTransitBuffer } from "@/lib/import/parse-in-transit";
import { normalizeCategory } from "@/lib/import/category";
import { computeCapacityKw } from "@/lib/capacity";

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

  // The Head can log an order on behalf of a sales person; everyone else
  // logs their own.
  let ownerId = user.id;
  const onBehalfOf = String(formData.get("ownerId") ?? "");
  if (user.role === "HEAD" && onBehalfOf) {
    const owner = await prisma.user.findUnique({ where: { id: onBehalfOf }, select: { id: true } });
    if (!owner) return { error: "Pick a valid sales person." };
    ownerId = owner.id;
  }

  await prisma.pendingOrder.create({
    data: {
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      customerName: parsed.data.customerName,
      note: parsed.data.note || null,
      paymentReceived: formData.get("paymentReceived") === "on",
      ownerId,
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

// Matches sheet rows to products by code (ignoring case and spaces). An
// unknown code is created only when its row also gives Model and Category.
async function resolveProductCodes(rows: { productCode: string; model: string | null; category: string | null }[]) {
  const norm = (c: string) => c.trim().toUpperCase();
  const codes = Array.from(new Set(rows.map((r) => r.productCode.trim())));
  const existing = await prisma.product.findMany({
    where: { code: { in: codes, mode: "insensitive" } },
    select: { id: true, code: true },
  });
  const productIdByCode = new Map(existing.map((p) => [norm(p.code), p.id]));
  const productsCreated: string[] = [];
  for (const r of rows) {
    if (productIdByCode.has(norm(r.productCode)) || !r.model || !r.category) continue;
    const category = normalizeCategory(r.category);
    const created = await prisma.product.create({
      data: {
        code: r.productCode.trim(),
        brand: "MIDEA",
        category,
        subCategory: "Uncategorized",
        model: r.model,
        capacityKw: computeCapacityKw(category, r.model),
      },
      select: { id: true, code: true },
    });
    productIdByCode.set(norm(created.code), created.id);
    productsCreated.push(created.code);
  }
  return { productIdFor: (code: string) => productIdByCode.get(norm(code)), productsCreated };
}

export type BulkReceiptState = {
  error?: string;
  summary?: {
    rowsRead: number;
    receiptsAdded: number;
    unitsAdded: number;
    pricesUpdated: number;
    productsCreated: string[];
    alreadyRecorded: number;
    problems: StockReceiptRowProblem[];
  };
};

// Bulk version of addStockReceipt: one row per arrival. Products are
// matched by code; an unknown code is created only when the row also gives
// its Model and Category, otherwise it's reported back. A row identical to
// a receipt already on file (same item, date and quantity) is skipped, so
// re-uploading the same sheet can't double-count stock.
export async function importStockReceipts(_prev: BulkReceiptState | undefined, formData: FormData): Promise<BulkReceiptState> {
  const head = await requireHead();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Please choose a file to upload." };
  const defaultRaw = String(formData.get("defaultDate") ?? "");
  const defaultDate = defaultRaw ? utcDate(defaultRaw) : null;

  let parsed: Awaited<ReturnType<typeof parseStockReceiptsBuffer>>;
  try {
    parsed = await parseStockReceiptsBuffer(await file.arrayBuffer());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the uploaded file." };
  }
  const problems = [...parsed.problems];
  if (parsed.rows.length === 0 && problems.length === 0) return { error: "No usable rows found in the file." };

  const { productIdFor, productsCreated } = await resolveProductCodes(parsed.rows);

  const ready: { productId: string; quantity: number; receivedAt: Date; dealerPrice: number | null; note: string | null }[] = [];
  for (const r of parsed.rows) {
    const productId = productIdFor(r.productCode);
    if (!productId) {
      problems.push({ rowNumber: r.rowNumber, problem: `Product code ${r.productCode} not found - add Model and Category to create it` });
      continue;
    }
    const receivedAt = r.receivedAt ?? defaultDate;
    if (!receivedAt) {
      problems.push({ rowNumber: r.rowNumber, problem: `No date received (${r.productCode}) - fill the column or pick a default date` });
      continue;
    }
    ready.push({ productId, quantity: r.quantity, receivedAt, dealerPrice: r.dealerPrice, note: r.note });
  }

  // Skip rows already on file - same item, date and quantity.
  const onFile = ready.length
    ? await prisma.stockReceipt.findMany({
        where: { productId: { in: Array.from(new Set(ready.map((r) => r.productId))) } },
        select: { productId: true, receivedAt: true, quantity: true },
      })
    : [];
  const key = (r: { productId: string; receivedAt: Date; quantity: number }) => `${r.productId}|${r.receivedAt.getTime()}|${r.quantity}`;
  const onFileKeys = new Set(onFile.map(key));
  const toAdd = ready.filter((r) => !onFileKeys.has(key(r)));

  if (toAdd.length > 0) {
    await prisma.stockReceipt.createMany({ data: toAdd.map((r) => ({ ...r, createdById: head.id })) });
  }

  // Updated dealer's prices become that month's price entry (latest row wins).
  const priceByProductMonth = new Map<string, { productId: string; month: Date; dealerPrice: number }>();
  for (const r of toAdd) {
    if (r.dealerPrice == null) continue;
    const month = new Date(Date.UTC(r.receivedAt.getUTCFullYear(), r.receivedAt.getUTCMonth(), 1));
    priceByProductMonth.set(`${r.productId}|${month.getTime()}`, { productId: r.productId, month, dealerPrice: r.dealerPrice });
  }
  for (const p of priceByProductMonth.values()) {
    await prisma.pricelist.upsert({
      where: { productId_month: { productId: p.productId, month: p.month } },
      create: { productId: p.productId, month: p.month, dealerPrice: p.dealerPrice },
      update: { dealerPrice: p.dealerPrice },
    });
  }

  revalidateStock();
  if (priceByProductMonth.size > 0) revalidatePath("/pricelist");
  revalidatePath("/deals/new");

  return {
    summary: {
      rowsRead: parsed.rows.length + parsed.problems.length,
      receiptsAdded: toAdd.length,
      unitsAdded: toAdd.reduce((s, r) => s + r.quantity, 0),
      pricesUpdated: priceByProductMonth.size,
      productsCreated,
      alreadyRecorded: ready.length - toAdd.length,
      problems: problems.sort((a, b) => a.rowNumber - b.rowNumber),
    },
  };
}

// ---- In-transit goods (ordered from the factory, not yet arrived) ----

const inTransitSchema = z.object({
  productId: z.string().min(1, "Pick the item."),
  quantity: z.coerce.number().int("Quantity must be a whole number.").positive("Quantity must be at least 1."),
  eta: z.string().optional(),
  orderedAt: z.string().optional(),
  reference: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

export async function addInTransit(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const head = await requireHead();
  const parsed = inTransitSchema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    eta: formData.get("eta") ?? undefined,
    orderedAt: formData.get("orderedAt") ?? undefined,
    reference: formData.get("reference") ?? undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const eta = parsed.data.eta ? utcDate(parsed.data.eta) : null;
  const orderedAt = parsed.data.orderedAt ? utcDate(parsed.data.orderedAt) : null;

  await prisma.inTransitOrder.create({
    data: {
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      eta,
      orderedAt,
      reference: parsed.data.reference || null,
      note: parsed.data.note || null,
      createdById: head.id,
    },
  });
  revalidateStock();
  return { ok: true };
}

export type BulkInTransitState = {
  error?: string;
  summary?: {
    rowsRead: number;
    added: number;
    units: number;
    productsCreated: string[];
    alreadyRecorded: number;
    problems: StockReceiptRowProblem[];
  };
};

// One row per shipment line. A row identical to an open in-transit entry
// (same item, quantity, ETA and reference) is skipped, so re-uploading the
// same sheet doesn't double it.
export async function importInTransit(_prev: BulkInTransitState | undefined, formData: FormData): Promise<BulkInTransitState> {
  const head = await requireHead();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Please choose a file to upload." };

  let parsed: Awaited<ReturnType<typeof parseInTransitBuffer>>;
  try {
    parsed = await parseInTransitBuffer(await file.arrayBuffer());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the uploaded file." };
  }
  const problems = [...parsed.problems];
  if (parsed.rows.length === 0 && problems.length === 0) return { error: "No usable rows found in the file." };

  const { productIdFor, productsCreated } = await resolveProductCodes(parsed.rows);
  const ready = [];
  for (const r of parsed.rows) {
    const productId = productIdFor(r.productCode);
    if (!productId) {
      problems.push({ rowNumber: r.rowNumber, problem: `Product code ${r.productCode} not found - add Model and Category to create it` });
      continue;
    }
    ready.push({ productId, quantity: r.quantity, eta: r.eta, orderedAt: r.orderedAt, reference: r.reference, note: r.note });
  }

  const open = ready.length
    ? await prisma.inTransitOrder.findMany({
        where: { status: "IN_TRANSIT", productId: { in: Array.from(new Set(ready.map((r) => r.productId))) } },
        select: { productId: true, quantity: true, receivedQty: true, eta: true, reference: true },
      })
    : [];
  const key = (r: { productId: string; quantity: number; eta: Date | null; reference: string | null }) =>
    `${r.productId}|${r.quantity}|${r.eta?.getTime() ?? ""}|${r.reference ?? ""}`;
  const openKeys = new Set(open.map((o) => key({ ...o, quantity: o.quantity + o.receivedQty })));
  const toAdd = ready.filter((r) => !openKeys.has(key(r)));
  if (toAdd.length > 0) {
    await prisma.inTransitOrder.createMany({ data: toAdd.map((r) => ({ ...r, createdById: head.id })) });
  }

  revalidateStock();
  return {
    summary: {
      rowsRead: parsed.rows.length + parsed.problems.length,
      added: toAdd.length,
      units: toAdd.reduce((s, r) => s + r.quantity, 0),
      productsCreated,
      alreadyRecorded: ready.length - toAdd.length,
      problems: problems.sort((a, b) => a.rowNumber - b.rowNumber),
    },
  };
}

// Moves units from in transit into stock: records a StockReceipt for the
// quantity and date given. Receiving less than what's in transit leaves the
// rest in transit.
export async function receiveInTransit(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const head = await requireHead();
  const id = String(formData.get("id") ?? "");
  const quantity = Number(formData.get("quantity"));
  const receivedAt = utcDate(String(formData.get("receivedAt") ?? ""));
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: "Quantity must be a whole number above 0." };
  if (!receivedAt) return { error: "Enter the date it entered stock." };
  const order = await prisma.inTransitOrder.findUnique({ where: { id } });
  if (!order || order.status !== "IN_TRANSIT") return { error: "This shipment is no longer in transit." };
  if (quantity > order.quantity) return { error: `Only ${order.quantity} unit(s) are in transit on this line.` };

  const remaining = order.quantity - quantity;
  await prisma.$transaction([
    prisma.stockReceipt.create({
      data: {
        productId: order.productId,
        quantity,
        receivedAt,
        note: order.reference ? `In transit: ${order.reference}` : "From in transit",
        createdById: head.id,
      },
    }),
    prisma.inTransitOrder.update({
      where: { id },
      data: { quantity: remaining, receivedQty: order.receivedQty + quantity, status: remaining === 0 ? "RECEIVED" : "IN_TRANSIT" },
    }),
  ]);
  revalidateStock();
  return { ok: true };
}

export async function cancelInTransit(id: string) {
  await requireHead();
  await prisma.inTransitOrder.update({ where: { id }, data: { status: "CANCELLED" } });
  revalidateStock();
}
