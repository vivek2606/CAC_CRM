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

// Each product's approximate current stock: the most recent Stock & Price
// List snapshot's quantity, minus whatever's been sold (Won) since that
// snapshot was taken - so a deal won the day of or before the snapshot is
// already excluded (it was counted, or not, in the snapshot itself), while
// one won after it draws down the figure shown here. A product with no
// snapshot at all is left out of the map entirely (stock untracked for it),
// rather than reading as zero.
export async function getAvailableStockByProduct(): Promise<Map<string, number>> {
  const stocks = await prisma.productStock.findMany({
    select: { productId: true, quantity: true, asOfDate: true },
  });
  if (stocks.length === 0) return new Map();

  const cutoff = stocks.reduce((max, s) => (s.asOfDate > max ? s.asOfDate : max), stocks[0].asOfDate);
  const sold = await prisma.dealLineItem.groupBy({
    by: ["productId"],
    where: { deal: { stage: "WON", closedAt: { gt: cutoff } } },
    _sum: { qty: true },
  });
  const soldByProduct = new Map(sold.map((s) => [s.productId, s._sum.qty ?? 0]));

  const map = new Map<string, number>();
  for (const s of stocks) {
    map.set(s.productId, Math.max(0, s.quantity - (soldByProduct.get(s.productId) ?? 0)));
  }
  return map;
}

// Products a rep can actually search for and quote - ones with a current
// dealer price on file (from a Stock & Price List upload or a manually-added
// price). Excludes a product known only from historical sales-register data,
// which was never priced and has no code/model info a rep should be quoting
// from. Used by every rep-facing product search (Products page lookup, deal
// line-item picker) - the Head's own price-entry forms intentionally skip
// this filter, since pricing a not-yet-priced product is exactly what those
// are for.
export async function getQuotableProducts(): Promise<{ id: string; code: string; model: string }[]> {
  return prisma.product.findMany({
    where: { pricelistEntries: { some: {} } },
    orderBy: { model: "asc" },
    select: { id: true, code: true, model: true },
  });
}

// The standalone model -> tentative price lookup (TentativePrice). This has
// no relation to Product/Pricelist at all - it's keyed purely on the model
// name text typed into the upload sheet, for models that may not exist in
// the product catalog. Callers match by model name themselves.
export async function getAllTentativePrices(): Promise<{ model: string; category: string; dealerPrice: number }[]> {
  return prisma.tentativePrice.findMany({
    select: { model: true, category: true, dealerPrice: true },
    orderBy: { model: "asc" },
  });
}
