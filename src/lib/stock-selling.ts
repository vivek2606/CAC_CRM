import { prisma } from "@/lib/prisma";
import { getAvailableStockByProduct } from "@/lib/pricing";

// Stock-led selling: models sitting in stock (slow-moving or aged) with the
// customers who bought them before, and stock arriving or just arrived with
// the customers waiting for it (open pending orders, deals lost because the
// item wasn't available).

export const SLOW_NO_SALE_DAYS = 90; // no sale in this long = slow
export const SLOW_COVER_MONTHS = 6; // or more than this many months of stock
export const AGED_DAYS = 180; // oldest units in stock this long = aged
export const BOUGHT_BEFORE_YEARS = 2;
export const LOST_NO_STOCK_DAYS = 180;
export const ARRIVED_DAYS = 14;
const DAY = 86400000;

export type PastBuyer = { key: string; accountId: string | null; name: string; phone: string | null; ownerId: string; ownerName: string; qty: number; lastDate: Date; lastRate: number };
export type StockToSell = {
  productId: string;
  model: string;
  code: string;
  category: string;
  free: number; // available to sell (after reservations)
  oldestDays: number | null; // age of the oldest units in stock
  oldestSince: Date | null;
  ageIsAtLeast: boolean; // the oldest units predate the stock count - at least this old
  lastSale: Date | null;
  monthlyRate: number; // units a month, last 6 months
  coverMonths: number | null; // free ÷ monthly rate (null = no sales)
  slow: boolean;
  aged: boolean;
  buyers: PastBuyer[];
};

// Each in-stock model's age (oldest units first out: the stock is made of
// the latest arrivals) and selling rate; the slow or aged ones, with who
// bought them before. ownerIds: only those sales people's customers.
export async function getStockToSell(ownerIds: string[] | null, now = new Date()): Promise<StockToSell[]> {
  const sixMonthsAgo = new Date(now.getTime() - 182 * DAY);
  const [free, products, snapshots, receipts, recentSales] = await Promise.all([
    getAvailableStockByProduct(),
    prisma.product.findMany({ select: { id: true, model: true, code: true, category: true } }),
    prisma.productStock.findMany({ select: { productId: true, asOfDate: true } }),
    prisma.stockReceipt.findMany({ orderBy: { receivedAt: "desc" }, select: { productId: true, quantity: true, receivedAt: true } }),
    prisma.saleLineItem.groupBy({ by: ["productId"], where: { docDate: { gte: sixMonthsAgo }, qty: { gt: 0 } }, _sum: { qty: true } }),
  ]);
  const lastSales = await prisma.saleLineItem.groupBy({ by: ["productId"], where: { productId: { in: [...free.keys()] }, qty: { gt: 0 } }, _max: { docDate: true } });
  const lastSaleBy = new Map(lastSales.map((s) => [s.productId, s._max.docDate]));
  const soldBy = new Map(recentSales.map((s) => [s.productId, s._sum.qty ?? 0]));
  const snapBy = new Map(snapshots.map((s) => [s.productId, s.asOfDate]));
  const receiptsBy = new Map<string, { quantity: number; receivedAt: Date }[]>();
  for (const r of receipts) receiptsBy.set(r.productId, [...(receiptsBy.get(r.productId) ?? []), r]);
  const productBy = new Map(products.map((p) => [p.id, p]));

  const rows: StockToSell[] = [];
  for (const [productId, qty] of free) {
    const p = productBy.get(productId);
    if (!p || qty <= 0) continue;
    // Walk back through arrivals (newest first) until they cover the stock.
    const snap = snapBy.get(productId) ?? null;
    let left = qty;
    let oldestSince: Date | null = null;
    for (const r of receiptsBy.get(productId) ?? []) {
      if (snap && r.receivedAt < snap) break; // already inside the stock count
      oldestSince = r.receivedAt;
      left -= r.quantity;
      if (left <= 0) break;
    }
    const ageIsAtLeast = left > 0 && !!snap;
    if (left > 0 && snap) oldestSince = snap;
    const oldestDays = oldestSince ? Math.floor((now.getTime() - oldestSince.getTime()) / DAY) : null;
    const monthlyRate = (soldBy.get(productId) ?? 0) / 6;
    const coverMonths = monthlyRate > 0 ? qty / monthlyRate : null;
    const lastSale = lastSaleBy.get(productId) ?? null;
    const slow = !lastSale || now.getTime() - lastSale.getTime() > SLOW_NO_SALE_DAYS * DAY || coverMonths == null || coverMonths > SLOW_COVER_MONTHS;
    const aged = oldestDays != null && oldestDays > AGED_DAYS;
    if (!slow && !aged) continue;
    rows.push({ productId, model: p.model, code: p.code, category: p.category, free: qty, oldestDays, oldestSince, ageIsAtLeast, lastSale, monthlyRate, coverMonths, slow, aged, buyers: [] });
  }

  // Who bought these models before (last 2 years of invoices).
  if (rows.length) {
    const since = new Date(now.getTime() - BOUGHT_BEFORE_YEARS * 365 * DAY);
    const lines = await prisma.saleLineItem.findMany({
      where: { productId: { in: rows.map((r) => r.productId) }, docDate: { gte: since }, qty: { gt: 0 } },
      orderBy: { docDate: "desc" },
      select: {
        productId: true, qty: true, value: true, docDate: true, ownerId: true, owner: { select: { name: true } },
        deal: { select: { customerName: true, customerPhone: true, account: { select: { id: true, name: true, phone: true, ownerId: true, owner: { select: { name: true } } } } } },
      },
    });
    const byProduct = new Map<string, Map<string, PastBuyer>>();
    for (const l of lines) {
      const a = l.deal?.account;
      const name = a?.name ?? l.deal?.customerName ?? "";
      if (!name) continue;
      // The customer's sales person: the account's, else whoever sold it.
      const ownerId = a?.ownerId ?? l.ownerId;
      if (ownerIds && !ownerIds.includes(ownerId)) continue;
      const key = a?.id ?? `n:${name.toLowerCase()}`;
      const m = byProduct.get(l.productId) ?? new Map<string, PastBuyer>();
      const b = m.get(key);
      if (b) b.qty += l.qty;
      else m.set(key, { key, accountId: a?.id ?? null, name, phone: a?.phone ?? l.deal?.customerPhone ?? null, ownerId, ownerName: a?.owner.name ?? l.owner.name, qty: l.qty, lastDate: l.docDate, lastRate: l.qty ? l.value / l.qty : 0 });
      byProduct.set(l.productId, m);
    }
    for (const r of rows) r.buyers = [...(byProduct.get(r.productId)?.values() ?? [])].sort((a, b) => b.qty - a.qty);
  }
  // Oldest and biggest first.
  return rows.sort((a, b) => (b.oldestDays ?? 0) - (a.oldestDays ?? 0) || b.free - a.free);
}

export type Waiting = { kind: "pending" | "lost"; id: string; href: string; customer: string; qty: number | null; ownerId: string; ownerName: string; paid?: boolean; since: Date };
export type Incoming = { productId: string; model: string; code: string; qty: number; date: Date | null; reference: string | null; arrived: boolean; waiting: Waiting[] };

// Who's waiting for each model: open pending orders, and deals lost because
// the item wasn't available (last 6 months) that had it.
export async function waitingFor(productIds: string[], ownerIds: string[] | null, now = new Date()): Promise<Map<string, Waiting[]>> {
  const owner = ownerIds ? { ownerId: { in: ownerIds } } : {};
  const [pending, lost] = await Promise.all([
    prisma.pendingOrder.findMany({
      where: { ...owner, productId: { in: productIds }, status: "OPEN" },
      select: { id: true, productId: true, quantity: true, customerName: true, paymentReceived: true, createdAt: true, dealId: true, ownerId: true, owner: { select: { name: true } } },
    }),
    prisma.deal.findMany({
      where: { ...owner, stage: "LOST", lostReasonCategory: "PRODUCT_NOT_AVAILABLE", closedAt: { gte: new Date(now.getTime() - LOST_NO_STOCK_DAYS * DAY) }, items: { some: { productId: { in: productIds } } } },
      select: { id: true, title: true, closedAt: true, customerName: true, ownerId: true, account: { select: { name: true } }, owner: { select: { name: true } }, items: { select: { productId: true, qty: true } } },
    }),
  ]);
  const out = new Map<string, Waiting[]>();
  const add = (pid: string, w: Waiting) => out.set(pid, [...(out.get(pid) ?? []), w]);
  for (const o of pending)
    add(o.productId, { kind: "pending", id: o.id, href: o.dealId ? `/deals/${o.dealId}` : "/stock", customer: o.customerName, qty: o.quantity, ownerId: o.ownerId, ownerName: o.owner.name, paid: o.paymentReceived, since: o.createdAt });
  for (const d of lost)
    for (const i of d.items.filter((i) => productIds.includes(i.productId)))
      add(i.productId, { kind: "lost", id: d.id, href: `/deals/${d.id}`, customer: d.account?.name ?? d.customerName ?? d.title, qty: i.qty, ownerId: d.ownerId, ownerName: d.owner.name, since: d.closedAt ?? now });
  for (const list of out.values()) list.sort((a, b) => Number(b.paid ?? false) - Number(a.paid ?? false) || a.since.getTime() - b.since.getTime());
  return out;
}

// Stock on its way (in transit) and arrived in the last 14 days, with who's
// waiting for each.
export async function getIncoming(ownerIds: string[] | null, now = new Date()): Promise<Incoming[]> {
  const [transit, arrived] = await Promise.all([
    prisma.inTransitOrder.findMany({
      where: { status: "IN_TRANSIT", quantity: { gt: 0 } },
      orderBy: [{ eta: { sort: "asc", nulls: "last" } }],
      select: { productId: true, quantity: true, eta: true, reference: true, product: { select: { model: true, code: true } } },
    }),
    prisma.stockReceipt.findMany({
      where: { receivedAt: { gte: new Date(now.getTime() - ARRIVED_DAYS * DAY) } },
      orderBy: { receivedAt: "desc" },
      select: { productId: true, quantity: true, receivedAt: true, note: true, product: { select: { model: true, code: true } } },
    }),
  ]);
  const waits = await waitingFor([...new Set([...transit, ...arrived].map((x) => x.productId))], ownerIds, now);
  return [
    ...arrived.map((r) => ({ productId: r.productId, model: r.product.model, code: r.product.code, qty: r.quantity, date: r.receivedAt, reference: r.note, arrived: true, waiting: waits.get(r.productId) ?? [] })),
    ...transit.map((t) => ({ productId: t.productId, model: t.product.model, code: t.product.code, qty: t.quantity, date: t.eta, reference: t.reference, arrived: false, waiting: waits.get(t.productId) ?? [] })),
  ];
}

// Stock has arrived for these models: tell each sales person with customers
// waiting for them (phone notification).
export async function notifyStockArrived(productIds: string[]) {
  if (!productIds.length) return;
  const { sendPush } = await import("@/lib/push");
  const [waits, products] = await Promise.all([waitingFor(productIds, null), prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, model: true } })]);
  const byOwner = new Map<string, { models: Set<string>; customers: Set<string> }>();
  for (const [pid, list] of waits)
    for (const w of list) {
      const o = byOwner.get(w.ownerId) ?? { models: new Set(), customers: new Set() };
      o.models.add(products.find((p) => p.id === pid)?.model ?? "");
      o.customers.add(w.customer);
      byOwner.set(w.ownerId, o);
    }
  await Promise.all(
    [...byOwner].map(([ownerId, o]) =>
      sendPush([ownerId], {
        title: `Stock arrived: ${[...o.models].join(", ")}`,
        body: `${o.customers.size} of your customers were waiting: ${[...o.customers].slice(0, 4).join(", ")}${o.customers.size > 4 ? "..." : ""}`,
        url: "/stock/sell",
        tag: "stock-arrived",
      }),
    ),
  );
}
