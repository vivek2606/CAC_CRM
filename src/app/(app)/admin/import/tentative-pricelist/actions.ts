"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { parseTentativePricelistBuffer } from "@/lib/import/parse-tentative-pricelist";
import { transformTentativePricelist } from "@/lib/import/tentative-pricelist";

export type ImportSummary = {
  totalRowsIn: number;
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

  // Purely a model-name -> price registry, entirely independent of the
  // Product catalog - no matching, no product creation.
  let priceEntriesSet = 0;
  for (const entry of result.priceEntries) {
    await prisma.tentativePrice.upsert({
      where: { model: entry.model },
      create: { model: entry.model, category: entry.category, dealerPrice: entry.dealerPrice },
      update: { category: entry.category, dealerPrice: entry.dealerPrice },
    });
    priceEntriesSet++;
  }

  revalidatePath("/products");
  revalidatePath("/products/tentative");
  revalidatePath("/admin/import/tentative-pricelist");

  return {
    summary: {
      totalRowsIn: result.summary.totalRowsIn,
      priceEntriesSet,
      skippedFileRows,
    },
  };
}

export async function deleteTentativePrice(id: string) {
  await requireHead();
  await prisma.tentativePrice.delete({ where: { id } });
  revalidatePath("/products");
  revalidatePath("/products/tentative");
  revalidatePath("/admin/import/tentative-pricelist");
}
