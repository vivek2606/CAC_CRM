"use server";

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
  stockAsOfDate: string;
  skippedFileRows: number;
};

export type ImportState = { error?: string; summary?: ImportSummary };

const stockDateSchema = z.string().min(1, "Please pick the date this stock was counted as of.");

export async function importPricelistStock(_prevState: ImportState | undefined, formData: FormData): Promise<ImportState> {
  await requireHead();

  const stockDateRaw = stockDateSchema.safeParse(formData.get("stockAsOfDate"));
  if (!stockDateRaw.success) {
    return { error: stockDateRaw.error.issues[0]?.message ?? "Invalid date." };
  }
  const stockAsOfDate = new Date(`${stockDateRaw.data}T00:00:00.000Z`);
  if (Number.isNaN(stockAsOfDate.getTime())) {
    return { error: "Please pick a valid date." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  let rows: Awaited<ReturnType<typeof parsePricelistBuffer>>["rows"];
  let skippedFileRows = 0;
  try {
    const buffer = await file.arrayBuffer();
    const parsed = await parsePricelistBuffer(buffer);
    rows = parsed.rows;
    skippedFileRows = parsed.skippedRows;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the uploaded file." };
  }

  if (rows.length === 0) {
    return { error: "No usable rows found in the file." };
  }

  const result = transformPricelistStock(rows);

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
      },
      update: { category: p.category, model: p.model, capacityKw: p.capacityKw },
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
      create: { productId, month: entry.month, dealerPrice: entry.dealerPrice, landedCost: entry.landedCost },
      update: { dealerPrice: entry.dealerPrice, landedCost: entry.landedCost },
    });
    priceEntriesSet++;
  }

  // Stock - a full replacement snapshot: everything not in this upload reads
  // as zero as of this date, since the sheet is described as "the available
  // items as of yesterday" (an exhaustive count, not a partial patch).
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
      stockAsOfDate: stockDateRaw.data,
      skippedFileRows,
    },
  };
}
