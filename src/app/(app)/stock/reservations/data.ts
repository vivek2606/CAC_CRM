import { prisma } from "@/lib/prisma";
import { tidyReservations, ACTIVE_RESERVATION } from "@/lib/reservations";
import type { Prisma } from "@prisma/client";

export const reservationSelect = {
  id: true,
  qty: true,
  status: true,
  reason: true,
  requestedAt: true,
  decidedAt: true,
  decisionNote: true,
  expiresAt: true,
  endedAt: true,
  dealId: true,
  productId: true,
  requestedById: true,
  product: { select: { model: true, code: true, category: true } },
  deal: { select: { id: true, title: true, ownerId: true, customerName: true, account: { select: { name: true } }, owner: { select: { name: true } } } },
  requestedBy: { select: { name: true } },
  decidedBy: { select: { name: true } },
} satisfies Prisma.StockReservationSelect;
export type ReservationRow = Prisma.StockReservationGetPayload<{ select: typeof reservationSelect }>;

// Active (awaiting approval or reserved) and, with `recentDays`, those
// ended or decided since; ownerIds limits to those deals' owners.
export async function listReservations(opts: { ownerIds?: string[]; dealId?: string; recentDays?: number; status?: string[] } = {}) {
  await tidyReservations();
  const since = opts.recentDays ? new Date(Date.now() - opts.recentDays * 86400000) : null;
  const status = opts.status ?? ACTIVE_RESERVATION;
  return prisma.stockReservation.findMany({
    where: {
      ...(opts.dealId ? { dealId: opts.dealId } : {}),
      ...(opts.ownerIds ? { deal: { ownerId: { in: opts.ownerIds } } } : {}),
      ...(since ? { OR: [{ status: { in: status } }, { updatedAt: { gte: since } }] } : { status: { in: status } }),
    },
    orderBy: [{ requestedAt: "desc" }],
    select: reservationSelect,
    take: 500,
  });
}
export const customerOf = (r: ReservationRow) => r.deal.account?.name ?? r.deal.customerName ?? "";
