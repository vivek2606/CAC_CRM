"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { parseTentativePricelistBuffer } from "@/lib/import/parse-tentative-pricelist";
import { transformTentativePricelist } from "@/lib/import/tentative-pricelist";

export type ImportSummary = {
  totalRowsIn: number;
  productsUpserted: number;
  priceEntriesSet: number;
  skippedFileRows: number;
};

export type ImportState = { error?: string; summary?: ImportSummary };

export async function importTentativePricelist(
  _prevState: ImportState | undefined,
  formData: FormData
): Promise<ImportState> {
  await requireHead();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  let rows: Awaited<ReturnType<typeof parseTentativePricelistBuffer>>["rows"];
  let skippedFileRows = 0;
  try {
    const buffer = await file.arrayBuffer();
    const parsed = await parseTentativePricelistBuffer(buffer);
    rows = parsed.rows;
    skippedFileRows = parsed.skippedRows;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the uploaded file." };
  }

  if (rows.length === 0) {
    return { error: "No usable rows found in the file." };
  }

  const result = transformTentativePricelist(rows);

  // Products - matched by code, same as every other import. Sub-category
  // isn't in this sheet, so a brand-new product gets "Uncategorized" and an
  // existing one keeps whatever it already has.
  for (const p of result.products) {
    await prisma.product.upsert({
      where: { code: p.code },
      create: { code: p.code, brand: "MIDEA", category: p.category, subCategory: "Uncategorized", model: p.model, capacityKw: p.capacityKw },
      update: { category: p.category, model: p.model, capacityKw: p.capacityKw },
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
    await prisma.tentativePrice.upsert({
      where: { productId },
      create: { productId, dealerPrice: entry.dealerPrice },
      update: { dealerPrice: entry.dealerPrice },
    });
    priceEntriesSet++;
  }

  revalidatePath("/products");
  revalidatePath("/admin/import/tentative-pricelist");

  return {
    summary: {
      totalRowsIn: result.summary.totalRowsIn,
      productsUpserted: result.products.length,
      priceEntriesSet,
      skippedFileRows,
    },
  };
}

export async function deleteTentativePrice(id: string) {
  await requireHead();
  await prisma.tentativePrice.delete({ where: { id } });
  revalidatePath("/products");
  revalidatePath("/admin/import/tentative-pricelist");
}
