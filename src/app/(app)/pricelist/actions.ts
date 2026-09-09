"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";

const pricelistSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  month: z.string().min(1, "Month is required"),
  dealerPrice: z.coerce.number().min(0),
  landedPrice: z.coerce.number().min(0).nullable(),
});

function parseMonth(value: string): Date {
  // value comes from <input type="month"> as "YYYY-MM"
  return new Date(`${value}-01T00:00:00.000Z`);
}

function blankToNull(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export async function createPricelistEntry(formData: FormData) {
  await requireHead();
  const raw = Object.fromEntries(formData.entries());
  const parsed = pricelistSchema.parse({ ...raw, landedPrice: blankToNull(formData.get("landedPrice")) });

  const entry = await prisma.pricelist.create({
    data: {
      productId: parsed.productId,
      month: parseMonth(parsed.month),
      dealerPrice: parsed.dealerPrice,
      landedPrice: parsed.landedPrice,
    },
  });

  revalidatePath("/products");
  redirect(`/products?productId=${entry.productId}`);
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
