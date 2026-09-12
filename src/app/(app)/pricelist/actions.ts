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

export async function createPricelistEntry(formData: FormData) {
  await requireHead();
  const raw = Object.fromEntries(formData.entries());
  const parsed = pricelistSchema.parse({ ...raw, landedPrice: blankToNull(formData.get("landedPrice")) });
  const month = parseMonth(parsed.month);

  // Pricelist has at most one row per (product, month) - a product priced
  // earlier this month (by this form, or by a Stock & Price List / Price
  // Master upload) already has a row for it, so this must update that row
  // rather than blind-create and hit the unique constraint.
  await prisma.pricelist.upsert({
    where: { productId_month: { productId: parsed.productId, month } },
    create: { productId: parsed.productId, month, dealerPrice: parsed.dealerPrice, landedPrice: parsed.landedPrice },
    update: { dealerPrice: parsed.dealerPrice, landedPrice: parsed.landedPrice },
  });

  revalidatePath("/products");
  redirect(`/products?productId=${parsed.productId}`);
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
// When mode is "existing" this behaves exactly like createPricelistEntry.
export async function createProductAndPricelistEntry(formData: FormData) {
  await requireHead();
  const raw = Object.fromEntries(formData.entries());
  const entryParsed = pricelistEntrySchema.parse({ ...raw, landedPrice: blankToNull(formData.get("landedPrice")) });

  const mode = String(formData.get("mode") ?? "existing");
  let productId: string;
  if (mode === "new") {
    const productParsed = productSchema.parse({
      ...raw,
      capacityKw: blankToNull(formData.get("capacityKw") ?? undefined),
    });
    const product = await prisma.product.create({ data: productParsed });
    productId = product.id;
  } else {
    productId = String(formData.get("productId") ?? "").trim();
    if (!productId) throw new Error("Product is required");
  }

  const month = parseMonth(entryParsed.month);

  // Same reasoning as createPricelistEntry: upsert so re-pricing a product
  // for a month it already has a row for updates that row instead of
  // hitting the (productId, month) unique constraint.
  await prisma.pricelist.upsert({
    where: { productId_month: { productId, month } },
    create: { productId, month, dealerPrice: entryParsed.dealerPrice, landedPrice: entryParsed.landedPrice },
    update: { dealerPrice: entryParsed.dealerPrice, landedPrice: entryParsed.landedPrice },
  });

  revalidatePath("/products");
  redirect(`/products?productId=${productId}`);
}
