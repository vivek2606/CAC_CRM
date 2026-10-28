import { prisma } from "@/lib/prisma";

// Each product's current reference price - the latest Pricelist entry in
// effect today (its "effective from" date, else the 1st of its month; one
// uploaded ahead of time waits for its date), landed price first, falling
// back to dealer price when landed isn't set. Used both to auto-fill a line
// item's rate when a product is picked, and as the "catalog price" a deal's
// itemized total is compared against for discount approval.
export async function getLatestPriceByProduct(asOf = new Date()): Promise<Map<string, number>> {
  const history = await getPriceHistory();
  const map = new Map<string, number>();
  for (const [productId, entries] of history) {
    const p = priceAt(entries, asOf);
    if (p) map.set(productId, p.price);
  }
  return map;
}

// A product's prices over time, oldest first: from when each applies, and
// the quote-facing price (landed, else dealer).
export type PricePoint = { from: Date; price: number };
const firstOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
export async function getPriceHistory(productIds?: string[]): Promise<Map<string, PricePoint[]>> {
  const rows = await prisma.pricelist.findMany({
    where: productIds ? { productId: { in: productIds } } : {},
    select: { productId: true, month: true, effectiveFrom: true, landedPrice: true, dealerPrice: true },
  });
  const map = new Map<string, PricePoint[]>();
  for (const r of rows) {
    const list = map.get(r.productId) ?? [];
    list.push({ from: r.effectiveFrom ?? firstOfMonth(r.month), price: r.landedPrice ?? r.dealerPrice });
    map.set(r.productId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.from.getTime() - b.from.getTime());
  return map;
}
// The price in effect on a date (a product with only later prices: its
// first one).
export function priceAt(points: PricePoint[], date: Date): PricePoint | null {
  let cur: PricePoint | null = null;
  for (const p of points) if (p.from.getTime() <= date.getTime()) cur = p;
  return cur ?? points[0] ?? null;
}

// For an open quotation's products: prices changed since its date, and
// changes coming up (uploaded ahead of time) - so old rates aren't sent.
export type PriceChange = { productId: string; description: string; from: number; to: number; on: Date; upcoming: boolean };
export async function priceChangesSince(lines: { productId: string; description: string }[], quoteDate: Date, now = new Date()): Promise<PriceChange[]> {
  const ids = [...new Set(lines.map((l) => l.productId))];
  if (!ids.length) return [];
  return priceChangesIn(await getPriceHistory(ids), lines, quoteDate, now);
}
// The same, from price history already loaded (many quotations at once).
export function priceChangesIn(history: Map<string, PricePoint[]>, lines: { productId: string; description: string }[], quoteDate: Date, now = new Date()): PriceChange[] {
  const out: PriceChange[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.productId)) continue;
    seen.add(l.productId);
    const points = history.get(l.productId) ?? [];
    const then = priceAt(points, quoteDate);
    const current = priceAt(points, now);
    if (then && current && Math.abs(current.price - then.price) > 0.005)
      out.push({ productId: l.productId, description: l.description, from: then.price, to: current.price, on: current.from, upcoming: false });
    const next = points.find((p) => p.from.getTime() > now.getTime());
    if (next && current && Math.abs(next.price - current.price) > 0.005)
      out.push({ productId: l.productId, description: l.description, from: current.price, to: next.price, on: next.from, upcoming: true });
  }
  return out;
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

// Every product in the catalog - pickable on deals and quotes whether or
// not it has a dealer price yet (the rate is then typed in, or comes from
// the tentative price list on a quote).
export async function getQuotableProducts(): Promise<{ id: string; code: string; model: string; maxDiscountPct: number | null }[]> {
  return prisma.product.findMany({
    orderBy: { model: "asc" },
    select: { id: true, code: true, model: true, maxDiscountPct: true },
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

// A saved quotation's product lines, for price checks: the product each
// line was picked from (older quotes: matched by model), a modular outdoor's
// modules, never custom lines or tentative prices.
type QuoteRowLike = { kind: string; productId?: string | null; description?: string; modules?: { productId: string; model: string }[] };
export function quoteProductLines(rows: QuoteRowLike[], idByModel: Map<string, string>): { productId: string; description: string }[] {
  const out: { productId: string; description: string }[] = [];
  for (const r of rows) {
    if (r.kind !== "item") continue;
    if (r.modules?.length) {
      for (const m of r.modules) if (!m.productId.startsWith("tentative:")) out.push({ productId: m.productId, description: m.model });
      continue;
    }
    const id = r.productId ?? idByModel.get((r.description ?? "").trim().toLowerCase());
    if (id && !id.startsWith("tentative:")) out.push({ productId: id, description: r.description ?? "" });
  }
  return out;
}
export async function productIdByModel(): Promise<Map<string, string>> {
  const products = await prisma.product.findMany({ select: { id: true, model: true } });
  return new Map(products.map((p) => [p.model.trim().toLowerCase(), p.id]));
}
