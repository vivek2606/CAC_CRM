"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { productSchema, pricelistEntrySchema } from "@/lib/schemas";

const pricelistSchema = pricelistEntrySchema.extend({
  productId: z.string().min(1, "Product is required"),
});

function parseMonth(value: string): Date {
  return new Date(`${value}-01T00:00:00.000Z`);
}

function blankToNull(value: FormDataEntryValue | null | undefined) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export async function updatePricelistEntry(entryId: string, formData: FormData) {
  await requireHead();
  const raw = Object.fromEntries(formData.entries());
  const parsed = pricelistSchema.parse({ ...raw, landedPrice: blankToNull(formData.get("landedPrice")) });

  await prisma.pricelist.update({
    where: { id: entryId },
    data: {
      productId: parsed.productId,
      month: parseMonth(parsed.month),
      dealerPrice: parsed.dealerPrice,
      landedPrice: parsed.landedPrice,
    },
  });

  revalidatePath("/products");
  redirect("/products");
}

export async function deletePricelistEntry(entryId: string) {
  await requireHead();
  await prisma.pricelist.delete({ where: { id: entryId } });
  revalidatePath("/products");
  redirect("/products");
}

// Lets Head create a brand-new product and its first price entry in one
// step, instead of a separate trip through a product-creation page first.
// When mode is "existing" it just prices that product for the month.
// Problems (a product code already in the catalog, a missing field) come
// back as a message for the form instead of an error page.
export async function createProductAndPricelistEntry(formData: FormData): Promise<{ error: string } | void> {
  await requireHead();
  const raw = Object.fromEntries(formData.entries());
  const entry = pricelistEntrySchema.safeParse({ ...raw, landedPrice: blankToNull(formData.get("landedPrice")) });
  if (!entry.success) return { error: entry.error.issues[0]?.message ?? "Check the month and prices." };
  const entryParsed = entry.data;

  const mode = String(formData.get("mode") ?? "existing");
  let productId: string;
  if (mode === "new") {
    const text = (k: string) => String(formData.get(k) ?? "").trim();
    const product = productSchema.safeParse({
      code: text("code"),
      brand: text("brand"),
      category: text("category"),
      subCategory: text("subCategory"),
      model: text("model"),
      capacityKw: blankToNull(formData.get("capacityKw") ?? undefined),
    });
    if (!product.success) return { error: product.error.issues[0]?.message ?? "Fill in all the product details." };
    const existing = await prisma.product.findFirst({
      where: { code: { equals: product.data.code, mode: "insensitive" } },
      select: { code: true, brand: true, model: true },
    });
    if (existing) {
      return {
        error: `Product code ${existing.code} is already in the catalog (${existing.brand} ${existing.model}). Choose "Existing product" and pick it to add this price.`,
      };
    }
    productId = (await prisma.product.create({ data: product.data })).id;
  } else {
    productId = String(formData.get("productId") ?? "").trim();
    if (!productId) return { error: "Pick the product." };
  }

  const month = parseMonth(entryParsed.month);

  // Pricelist has at most one row per (product, month) - an earlier price
  // this month (by this form or an upload) is updated, not duplicated.
  await prisma.pricelist.upsert({
    where: { productId_month: { productId, month } },
    create: { productId, month, dealerPrice: entryParsed.dealerPrice, landedPrice: entryParsed.landedPrice },
    update: { dealerPrice: entryParsed.dealerPrice, landedPrice: entryParsed.landedPrice },
  });

  revalidatePath("/products");
  redirect(`/products?productId=${productId}`);
}
