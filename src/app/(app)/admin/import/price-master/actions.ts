"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { parsePriceMasterBuffer } from "@/lib/import/parse-price-master";
import { transformPriceMaster } from "@/lib/import/price-master";

function parseMonthInput(raw: string): Date | null {
  const m = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

// --- Price master upload ---

export type ImportSummary = {
  totalRowsIn: number;
  productsUpserted: number;
  priceEntriesSet: number;
  skippedFileRows: number;
};

export type ImportState = { error?: string; summary?: ImportSummary };

export async function importPriceMaster(_prevState: ImportState | undefined, formData: FormData): Promise<ImportState> {
  await requireHead();

  const monthRaw = formData.get("month");
  if (typeof monthRaw !== "string" || monthRaw.trim() === "") {
    return { error: "Please choose the month this price list applies to." };
  }
  const month = parseMonthInput(monthRaw);
  if (!month) return { error: "Please choose a valid month." };

  const rate = await prisma.monthlyExchangeRate.findUnique({ where: { month } });
  if (!rate) {
    return {
      error:
        "No exchange rate is set for this month yet. It's picked up automatically from a Sales Register upload, or set manually on the Exchange Rate page - do that first, then upload again.",
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  let rows: Awaited<ReturnType<typeof parsePriceMasterBuffer>>["rows"];
  let skippedFileRows = 0;
  try {
    const buffer = await file.arrayBuffer();
    const parsed = await parsePriceMasterBuffer(buffer);
    rows = parsed.rows;
    skippedFileRows = parsed.skippedRows;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the uploaded file." };
  }

  if (rows.length === 0) {
    return { error: "No usable rows found in the file." };
  }

  const result = transformPriceMaster(rows);

  for (const p of result.products) {
    await prisma.product.upsert({
      where: { code: p.code },
      create: { code: p.code, brand: p.brand, category: p.category, subCategory: p.subCategory, model: p.model, capacityKw: p.capacityKw },
      update: { brand: p.brand, category: p.category, subCategory: p.subCategory, model: p.model, capacityKw: p.capacityKw },
    });
  }

  const dbProducts = await prisma.product.findMany({
    where: { code: { in: result.products.map((p) => p.code) } },
    select: { id: true, code: true },
  });
  const productIdByCode = new Map(dbProducts.map((p) => [p.code, p.id]));

  let priceEntriesSet = 0;
  for (const entry of result.priceEntries) {
    const productId = productIdByCode.get(entry.productCode);
    if (!productId) continue;
    const landedPrice = entry.dealerPrice * rate.rate;
    await prisma.pricelist.upsert({
      where: { productId_month: { productId, month } },
      create: { productId, month, dealerPrice: entry.dealerPrice, landedPrice },
      update: { dealerPrice: entry.dealerPrice, landedPrice },
    });
    priceEntriesSet++;
  }

  revalidatePath("/products");

  return {
    summary: {
      totalRowsIn: result.summary.totalRowsIn,
      productsUpserted: result.products.length,
      priceEntriesSet,
      skippedFileRows,
    },
  };
}
