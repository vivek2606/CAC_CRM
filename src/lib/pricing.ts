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

// Each product's current stock: its latest Stock & Price List snapshot,
// plus fresh units received after it (Stock Receipts), minus every unit
// billed after it - SaleLineItem covers both Sales Register billing and
// deals won in the CRM (net of returns). The snapshot is counted as of the
// end of its date, so billing and receipts on that date are taken to be in
// it already. A product with no snapshot starts from its first receipt. A
// product with neither is left out of the map (stock untracked for it),
// rather than reading as zero.
export async function getAvailableStockByProduct(): Promise<Map<string, number>> {
  const [snapshots, receipts] = await Promise.all([
    prisma.productStock.findMany({ select: { productId: true, quantity: true, asOfDate: true } }),
    prisma.stockReceipt.findMany({ select: { productId: true, quantity: true, receivedAt: true } }),
  ]);

  // Per product: the stock at the start of `from`, before billing is taken off.
  const base = new Map<string, { qty: number; from: Date }>();
  for (const s of snapshots) {
    base.set(s.productId, {
      qty: s.quantity,
      from: new Date(Date.UTC(s.asOfDate.getUTCFullYear(), s.asOfDate.getUTCMonth(), s.asOfDate.getUTCDate() + 1)),
    });
  }
  const firstReceipt = new Map<string, Date>();
  for (const r of receipts) {
    if (base.has(r.productId)) continue;
    const cur = firstReceipt.get(r.productId);
    if (!cur || r.receivedAt < cur) firstReceipt.set(r.productId, r.receivedAt);
  }
  for (const [productId, from] of firstReceipt) base.set(productId, { qty: 0, from });
  for (const r of receipts) {
    const b = base.get(r.productId)!;
    if (r.receivedAt >= b.from || firstReceipt.has(r.productId)) b.qty += r.quantity;
  }
  if (base.size === 0) return new Map();

  const earliest = Array.from(base.values()).reduce((min, b) => (b.from < min ? b.from : min), new Date());
  const billed = await prisma.saleLineItem.findMany({
    where: { productId: { in: Array.from(base.keys()) }, docDate: { gte: earliest } },
    select: { productId: true, qty: true, docDate: true },
  });
  for (const li of billed) {
    const b = base.get(li.productId)!;
    if (li.docDate >= b.from) b.qty -= li.qty;
  }

  const map = new Map<string, number>();
  for (const [productId, b] of base) map.set(productId, Math.max(0, Math.round(b.qty)));
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
