import { prisma } from "@/lib/prisma";

// Each product's current reference price - the most recent Pricelist entry's
// landed price, falling back to dealer price when landed isn't set. Used
// both to auto-fill a line item's rate when a product is picked, and as the
// "catalog price" a deal's itemized total is compared against for discount
// approval.
export async function getLatestPriceByProduct(): Promise<Map<string, number>> {
  const recentPrices = await prisma.pricelist.findMany({
    orderBy: { month: "desc" },
    select: { productId: true, landedPrice: true, dealerPrice: true },
  });
  const map = new Map<string, number>();
  for (const p of recentPrices) {
    if (!map.has(p.productId)) map.set(p.productId, p.landedPrice ?? p.dealerPrice);
  }
  return map;
}
