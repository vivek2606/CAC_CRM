"use server";

import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { modelKey } from "@/lib/model-family";
import { getModelPlans, type ModelPlan } from "@/lib/model-planning";

export type ModelSalesHistory = ModelPlan & { avgLabel: string; coverMonths: number };

// One model's sales month by month (this year and last), 3-month average,
// stock, in transit, pending orders and the quantity to order from Midea.
export async function modelSalesHistory(productId: string, coverMonths: number): Promise<ModelSalesHistory | null> {
  await requireBackOffice();
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { model: true } });
  if (!p) return null;
  const cover = [3, 4, 5, 6].includes(coverMonths) ? coverMonths : 4;
  const { window, plans } = await getModelPlans(cover, modelKey(p.model));
  return plans[0] ? { ...plans[0], avgLabel: window.avgLabel, coverMonths: cover } : null;
}
