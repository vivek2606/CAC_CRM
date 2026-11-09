import { prisma } from "@/lib/prisma";

// Stock reservations: a sales person asks to hold units of an item for a
// deal; the Head approves (or rejects) it. Approved units come off
// "available" for everyone else for RESERVATION_DAYS (the Head can extend).
// A reservation ends when the units are invoiced on the deal (fulfilled),
// the deal is lost (released), the sales person lets it go (released) or its
// time runs out (expired).

export const RESERVATION_DAYS = 14;
export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Awaiting approval",
  APPROVED: "Reserved",
  REJECTED: "Rejected",
  RELEASED: "Released",
  EXPIRED: "Expired",
  FULFILLED: "Invoiced",
};
export const RESERVATION_STATUS_TONE: Record<string, string> = {
  REQUESTED: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-700",
  RELEASED: "bg-slate-100 text-slate-600",
  EXPIRED: "bg-slate-100 text-slate-600",
  FULFILLED: "bg-indigo-100 text-indigo-700",
};
export const ACTIVE_RESERVATION = ["REQUESTED", "APPROVED"];
const DAY = 86400000;
export const holdUntil = (from: Date) => new Date(from.getTime() + RESERVATION_DAYS * DAY);

// Brings statuses up to date: past their date -> expired; deal lost ->
// released; the item invoiced on the deal since it was approved ->
// fulfilled. Cheap enough to run before reading reservations.
export async function tidyReservations(now = new Date()) {
  await prisma.stockReservation.updateMany({ where: { status: "APPROVED", expiresAt: { lt: now } }, data: { status: "EXPIRED", endedAt: now } });
  await prisma.stockReservation.updateMany({ where: { status: { in: ACTIVE_RESERVATION }, deal: { stage: "LOST" } }, data: { status: "RELEASED", endedAt: now } });
  const approved = await prisma.stockReservation.findMany({ where: { status: "APPROVED" }, select: { id: true, dealId: true, productId: true, decidedAt: true, requestedAt: true } });
  if (!approved.length) return;
  const billed = await prisma.saleLineItem.findMany({
    where: { dealId: { in: [...new Set(approved.map((r) => r.dealId))] }, productId: { in: [...new Set(approved.map((r) => r.productId))] } },
    select: { dealId: true, productId: true, docDate: true },
  });
  const done = approved.filter((r) => {
    // An invoice dated on/after the day of the request.
    const from = new Date(Date.UTC(r.requestedAt.getUTCFullYear(), r.requestedAt.getUTCMonth(), r.requestedAt.getUTCDate()));
    return billed.some((b) => b.dealId === r.dealId && b.productId === r.productId && b.docDate >= from);
  });
  if (done.length) await prisma.stockReservation.updateMany({ where: { id: { in: done.map((r) => r.id) } }, data: { status: "FULFILLED", endedAt: now } });
}

// Units held by approved reservations, per product (optionally leaving out
// one deal's own reservations).
export async function getReservedByProduct(opts: { exceptDealId?: string; now?: Date } = {}): Promise<Map<string, number>> {
  const now = opts.now ?? new Date();
  const rows = await prisma.stockReservation.groupBy({
    by: ["productId"],
    where: { status: "APPROVED", expiresAt: { gt: now }, ...(opts.exceptDealId ? { dealId: { not: opts.exceptDealId } } : {}) },
    _sum: { qty: true },
  });
  return new Map(rows.map((r) => [r.productId, r._sum.qty ?? 0]));
}
