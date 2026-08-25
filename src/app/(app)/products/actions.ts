"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";

const productSchema = z.object({
  code: z.string().min(1, "Product code is required"),
  brand: z.string().min(1, "Brand is required"),
  category: z.string().min(1, "Category is required"),
  subCategory: z.string().min(1, "Sub-category is required"),
  model: z.string().min(1, "Model is required"),
  capacityKw: z.coerce.number().min(0),
});

export async function createProduct(formData: FormData) {
  await requireHead();
  const raw = Object.fromEntries(formData.entries());
  const parsed = productSchema.parse(raw);

  const product = await prisma.product.create({ data: parsed });

  revalidatePath("/products");
  redirect(`/products/${product.id}`);
}

export async function updateProduct(productId: string, formData: FormData) {
  await requireHead();
  const raw = Object.fromEntries(formData.entries());
  const parsed = productSchema.parse(raw);

  await prisma.product.update({ where: { id: productId }, data: parsed });

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}

export async function deleteProduct(productId: string) {
  await requireHead();
  await prisma.product.delete({ where: { id: productId } });
  revalidatePath("/products");
  redirect("/products");
}
