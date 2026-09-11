"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { computeCapacityKw, isCapacityCategory } from "@/lib/capacity";
import { productSchema } from "@/lib/schemas";

function blankToNull(value: FormDataEntryValue | undefined) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export async function updateProduct(productId: string, formData: FormData) {
  await requireHead();
  const raw = Object.fromEntries(formData.entries());
  const parsed = productSchema.parse({ ...raw, capacityKw: blankToNull(formData.get("capacityKw") ?? undefined) });

  await prisma.product.update({ where: { id: productId }, data: parsed });

  revalidatePath("/products");
  redirect("/products");
}

export async function deleteProduct(productId: string) {
  await requireHead();
  await prisma.product.delete({ where: { id: productId } });
  revalidatePath("/products");
  redirect("/products");
}

export type RecomputeCapacityState = { summary?: { updated: number; unchanged: number; noMatch: number } };

// Recomputes Capacity (kW) from each product's model number, for the
// categories whose model numbers encode capacity (Atom Mini VRF, VRF,
// Rooftop, Floorstanding). Products outside those categories, or whose
// model doesn't contain a recognizable capacity code (e.g. spare parts,
// controllers), are left untouched.
export async function recomputeCapacities(): Promise<RecomputeCapacityState> {
  await requireHead();

  const products = await prisma.product.findMany({
    where: { category: { in: ["Atom Mini VRF", "VRF", "Rooftop", "Floorstanding"] } },
    select: { id: true, category: true, model: true, capacityKw: true },
  });

  let updated = 0;
  let unchanged = 0;
  let noMatch = 0;
  for (const p of products) {
    if (!isCapacityCategory(p.category)) continue;
    const computed = computeCapacityKw(p.category, p.model);
    if (computed == null) {
      noMatch++;
      continue;
    }
    if (computed === p.capacityKw) {
      unchanged++;
      continue;
    }
    await prisma.product.update({ where: { id: p.id }, data: { capacityKw: computed } });
    updated++;
  }

  revalidatePath("/products");
  return { summary: { updated, unchanged, noMatch } };
}
