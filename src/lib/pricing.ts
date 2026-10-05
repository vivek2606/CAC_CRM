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

// Each product's current stock: its latest opening stock (Stock & Price
// List upload), plus fresh units received from that date on (Stock
// Receipts), minus every unit billed from that date on - SaleLineItem
// covers both Sales Register billing and deals won in the CRM (net of
// returns). The opening stock applies at the START of its date, so that
// day's billing and arrivals adjust it. A product with no opening stock
// starts from its first receipt. A product with neither is left out of the
// map (stock untracked for it), rather than reading as zero.
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
      from: new Date(Date.UTC(s.asOfDate.getUTCFullYear(), s.asOfDate.getUTCMonth(), s.asOfDate.getUTCDate())),
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

// Units on their way from the factory, per product: total still in transit
// and the earliest expected arrival among its open lines.
export async function getInTransitByProduct(): Promise<Map<string, { qty: number; eta: Date | null }>> {
  const open = await prisma.inTransitOrder.findMany({
    where: { status: "IN_TRANSIT", quantity: { gt: 0 } },
    select: { productId: true, quantity: true, eta: true },
  });
  const map = new Map<string, { qty: number; eta: Date | null }>();
  for (const o of open) {
    const cur = map.get(o.productId) ?? { qty: 0, eta: null };
    cur.qty += o.quantity;
    if (o.eta && (!cur.eta || o.eta < cur.eta)) cur.eta = o.eta;
    map.set(o.productId, cur);
  }
  return map;
}

// Models where paid, still-open pending orders - across every sales
// person - add up to more than is in stock plus on its way. The shortfall
// has to be ordered from the factory on top of normal stock cover.
export type PendingShortfall = { paid: number; stock: number; inTransit: number; shortfall: number };
export async function getPendingShortfalls(
  available?: Map<string, number>,
  inTransit?: Map<string, { qty: number; eta: Date | null }>,
): Promise<Map<string, PendingShortfall>> {
  const [paid, stock, transit] = await Promise.all([
    prisma.pendingOrder.groupBy({
      by: ["productId"],
      where: { status: "OPEN", paymentReceived: true },
      _sum: { quantity: true },
    }),
    available ?? getAvailableStockByProduct(),
    inTransit ?? getInTransitByProduct(),
  ]);
  const map = new Map<string, PendingShortfall>();
  for (const p of paid) {
    const paidQty = p._sum.quantity ?? 0;
    const s = stock.get(p.productId) ?? 0;
    const t = transit.get(p.productId)?.qty ?? 0;
    if (paidQty > s + t) map.set(p.productId, { paid: paidQty, stock: s, inTransit: t, shortfall: paidQty - s - t });
  }
  return map;
}

// Short text for a product picker, e.g. "12 in transit, ETA 05 Dec 2026".
export function inTransitLabel(t: { qty: number; eta: Date | null } | undefined): string | null {
  if (!t || t.qty <= 0) return null;
  const eta = t.eta
    ? `, ETA ${t.eta.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}`
    : "";
  return `${t.qty} in transit${eta}`;
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
