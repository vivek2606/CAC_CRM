"use server";

import { withChangeReason } from "@/lib/change-log";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { parsePricelistBuffer } from "@/lib/import/parse-pricelist";
import { transformPricelistStock } from "@/lib/import/pricelist-stock";

export type ImportSummary = {
  totalRowsIn: number;
  productsUpserted: number;
  priceEntriesSet: number;
  stockEntriesSet: number;
  maxDiscountsSet: number;
  // The heading read as the max discount, or null with the headings seen.
  discountColumn: string | null;
  headers: string[];
  stockAsOfDate: string;
  skippedFileRows: number;
};

export type ImportState = { error?: string; summary?: ImportSummary };

const stockDateSchema = z.string().min(1, "Please pick the opening stock date.");

// "Prices effective from" (optional): prices uploaded ahead of time apply
// from this date; empty = from the 1st of their month.
function effectiveFromOf(formData: FormData): Date | null | "invalid" {
  const raw = formData.get("effectiveFrom");
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(`${raw.trim()}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

async function importPricelistStockUnlabelled(_prevState: ImportState | undefined, formData: FormData): Promise<ImportState> {
  await requireHead();

  const stockDateRaw = stockDateSchema.safeParse(formData.get("stockAsOfDate"));
  if (!stockDateRaw.success) {
    return { error: stockDateRaw.error.issues[0]?.message ?? "Invalid date." };
  }
  const stockAsOfDate = new Date(`${stockDateRaw.data}T00:00:00.000Z`);
  if (Number.isNaN(stockAsOfDate.getTime())) {
    return { error: "Please pick a valid date." };
  }

  const effectiveFrom = effectiveFromOf(formData);
  if (effectiveFrom === "invalid") return { error: "Pick a valid 'effective from' date." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  let rows: Awaited<ReturnType<typeof parsePricelistBuffer>>["rows"];
  let skippedFileRows = 0;
  let discountColumn: string | null = null;
  let headers: string[] = [];
  try {
    const buffer = await file.arrayBuffer();
    const parsed = await parsePricelistBuffer(buffer);
    rows = parsed.rows;
    skippedFileRows = parsed.skippedRows;
    discountColumn = parsed.discountColumn;
    headers = parsed.headers;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the uploaded file." };
  }

  if (rows.length === 0) {
    return { error: "No usable rows found in the file." };
  }

  const result = transformPricelistStock(
    rows,
    new Date(Date.UTC(stockAsOfDate.getUTCFullYear(), stockAsOfDate.getUTCMonth(), 1)),
  );

  // Products - matched by code, same as Price Master. Sub-category isn't in
  // this sheet, so a brand-new product gets "Uncategorized" (fixed up later
  // from Price Master or the Products page) and an existing product keeps
  // whatever sub-category it already has.
  for (const p of result.products) {
    await prisma.product.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        brand: "MIDEA",
        category: p.category,
        subCategory: "Uncategorized",
        model: p.model,
        capacityKw: p.capacityKw,
        maxDiscountPct: p.maxDiscountPct,
      },
      // A blank Max Discount % keeps the item's current one.
      update: { category: p.category, model: p.model, capacityKw: p.capacityKw, ...(p.maxDiscountPct != null ? { maxDiscountPct: p.maxDiscountPct } : {}) },
    });
  }

  const dbProducts = await prisma.product.findMany({
    where: { code: { in: result.products.map((p) => p.code) } },
    select: { id: true, code: true },
  });
  const productIdByCode = new Map(dbProducts.map((p) => [p.code, p.id]));

  // Prices - upsert by (product, month), same idempotent shape as every
  // other price source. dealerPrice/landedCost come straight from the sheet
  // in Naira (both excl. VAT) - no exchange rate involved anywhere in this
  // flow. landedCost is recorded for reference only, under its own field:
  // it must NOT land in landedPrice, which getLatestPriceByProduct() treats
  // as the quote-facing reference price - that has to stay Dealer's Price,
  // not internal cost. landedCost being set is also how the product detail
  // page recognizes "this entry came from this upload" for its current-
  // pricing view - no other price source ever sets it.
  let priceEntriesSet = 0;
  for (const entry of result.priceEntries) {
    const productId = productIdByCode.get(entry.productCode);
    if (!productId) continue;
    await prisma.pricelist.upsert({
      where: { productId_month: { productId, month: entry.month } },
      create: { productId, month: entry.month, dealerPrice: entry.dealerPrice, landedCost: entry.landedCost, effectiveFrom },
      update: { dealerPrice: entry.dealerPrice, landedCost: entry.landedCost, effectiveFrom },
    });
    priceEntriesSet++;
  }

  // Stock - a full replacement opening stock: everything not in this upload
  // reads as zero from this date, since the sheet is an exhaustive count of
  // what's available at the start of that day (not a partial patch). Billing
  // and arrivals dated on or after it are applied on top - see
  // getAvailableStockByProduct().
  await prisma.productStock.updateMany({ data: { quantity: 0, asOfDate: stockAsOfDate } });
  let stockEntriesSet = 0;
  for (const entry of result.stockEntries) {
    const productId = productIdByCode.get(entry.productCode);
    if (!productId) continue;
    await prisma.productStock.upsert({
      where: { productId },
      create: { productId, quantity: entry.quantity, asOfDate: stockAsOfDate },
      update: { quantity: entry.quantity, asOfDate: stockAsOfDate },
    });
    stockEntriesSet++;
  }

  revalidatePath("/products");
  revalidatePath("/pricelist");
  revalidatePath("/deals/new");

  return {
    summary: {
      totalRowsIn: result.summary.totalRowsIn,
      productsUpserted: result.products.length,
      priceEntriesSet,
      stockEntriesSet,
      maxDiscountsSet: result.products.filter((p) => p.maxDiscountPct != null).length,
      discountColumn,
      headers,
      stockAsOfDate: stockDateRaw.data,
      skippedFileRows,
    },
  };
}

// Its changes go into the change history marked as "Price list & stock upload".
export async function importPricelistStock(...args: Parameters<typeof importPricelistStockUnlabelled>): ReturnType<typeof importPricelistStockUnlabelled> {
  return withChangeReason("Price list & stock upload", () => importPricelistStockUnlabelled(...args));
}
