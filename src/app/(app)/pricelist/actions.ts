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
  landedPrice: z.coerce.number().min(0),
  exchangeRate: z.coerce.number().min(0),
});

function parseMonth(value: string): Date {
  // value comes from <input type="month"> as "YYYY-MM"
  return new Date(`${value}-01T00:00:00.000Z`);
}

export async function createPricelistEntry(formData: FormData) {
  await requireHead();
  const raw = Object.fromEntries(formData.entries());
  const parsed = pricelistSchema.parse(raw);

  const entry = await prisma.pricelist.create({
    data: {
      productId: parsed.productId,
      month: parseMonth(parsed.month),
      dealerPrice: parsed.dealerPrice,
      landedPrice: parsed.landedPrice,
      exchangeRate: parsed.exchangeRate,
    },
  });

  revalidatePath("/pricelist");
  revalidatePath(`/products/${parsed.productId}`);
  redirect(`/pricelist?productId=${entry.productId}`);
}

export async function updatePricelistEntry(entryId: string, formData: FormData) {
  await requireHead();
  const raw = Object.fromEntries(formData.entries());
  const parsed = pricelistSchema.parse(raw);

  await prisma.pricelist.update({
    where: { id: entryId },
    data: {
      productId: parsed.productId,
      month: parseMonth(parsed.month),
      dealerPrice: parsed.dealerPrice,
      landedPrice: parsed.landedPrice,
      exchangeRate: parsed.exchangeRate,
    },
  });

  revalidatePath("/pricelist");
  revalidatePath(`/products/${parsed.productId}`);
  redirect("/pricelist");
}

export async function deletePricelistEntry(entryId: string) {
  await requireHead();
  const entry = await prisma.pricelist.delete({ where: { id: entryId } });
  revalidatePath("/pricelist");
  revalidatePath(`/products/${entry.productId}`);
  redirect("/pricelist");
}
