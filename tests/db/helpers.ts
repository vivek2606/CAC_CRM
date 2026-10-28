import { describe } from "vitest";
import { prisma } from "@/lib/prisma";

export const hasDb = !!process.env.TEST_DATABASE_URL;
// Database tests run only with a test database.
export const describeDb = hasDb ? describe : describe.skip;

let n = 0;
export async function makeUser(name: string, title = "Sales Manager") {
  n++;
  return prisma.user.create({ data: { name, email: `t${n}-${Date.now()}@test.local`, passwordHash: "x", role: "SALES_MANAGER", title } });
}
export async function makeProduct(model: string, o: { maxDiscountPct?: number; dealerPrice?: number; landedPrice?: number } = {}) {
  n++;
  const p = await prisma.product.create({ data: { code: `TP-${n}-${Date.now()}`, brand: "Midea", category: "VRF", subCategory: "Outdoor", model, maxDiscountPct: o.maxDiscountPct ?? null } });
  if (o.dealerPrice != null)
    await prisma.pricelist.create({ data: { productId: p.id, month: new Date(Date.UTC(2026, 9, 1)), dealerPrice: o.dealerPrice, landedPrice: o.landedPrice ?? null } });
  return p;
}
