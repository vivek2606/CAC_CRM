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
  unmatchedModels: string[];
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

  // This sheet has nothing to match products by except the model name - no
  // product code, no category, and nothing derived from sales-register
  // history. A model isn't created here: it must already exist in the
  // catalog (from a Sales Register or Stock & Price List import), and one
  // model name can legitimately match more than one product code.
  const allProducts = await prisma.product.findMany({ select: { id: true, model: true } });
  const productIdsByModel = new Map<string, string[]>();
  for (const p of allProducts) {
    const key = p.model.trim().toLowerCase();
    const list = productIdsByModel.get(key) ?? [];
    list.push(p.id);
    productIdsByModel.set(key, list);
  }

  let priceEntriesSet = 0;
  const unmatchedModels: string[] = [];
  for (const entry of result.priceEntries) {
    const productIds = productIdsByModel.get(entry.model.toLowerCase());
    if (!productIds || productIds.length === 0) {
      unmatchedModels.push(entry.model);
      continue;
    }
    for (const productId of productIds) {
      await prisma.tentativePrice.upsert({
        where: { productId },
        create: { productId, dealerPrice: entry.dealerPrice },
        update: { dealerPrice: entry.dealerPrice },
      });
      priceEntriesSet++;
    }
  }

  revalidatePath("/products");
  revalidatePath("/admin/import/tentative-pricelist");

  return {
    summary: {
      totalRowsIn: result.summary.totalRowsIn,
      priceEntriesSet,
      skippedFileRows,
      unmatchedModels,
    },
  };
}

export async function deleteTentativePrice(id: string) {
  await requireHead();
  await prisma.tentativePrice.delete({ where: { id } });
  revalidatePath("/products");
  revalidatePath("/admin/import/tentative-pricelist");
}
