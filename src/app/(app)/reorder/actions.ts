"use server";

import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { modelKey } from "@/lib/model-family";
import { forecastSettings, getModelForecasts, type ModelForecast } from "@/lib/model-forecast";

// One model's Midea order plan (see model-forecast.ts) with its sales history.
export async function modelSalesHistory(productId: string, q: { arrive: string; g: string; go: string }): Promise<ModelForecast | null> {
  await requireBackOffice();
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { model: true } });
  if (!p) return null;
  return (await getModelForecasts(forecastSettings(q), modelKey(p.model)))[0] ?? null;
}
