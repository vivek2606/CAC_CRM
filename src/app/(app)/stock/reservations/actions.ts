"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner, isBackOffice } from "@/lib/rbac";
import { sendPush } from "@/lib/push";
import { audit } from "@/lib/audit";
import { getAvailableStockByProduct } from "@/lib/pricing";
import { ACTIVE_RESERVATION, RESERVATION_DAYS, holdUntil, tidyReservations } from "@/lib/reservations";

type Result = { error?: string };
const DAY = 86400000;

function refresh(dealId: string) {
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/stock/reservations");
  revalidatePath("/stock");
}
async function headIds() {
  return (await prisma.user.findMany({ where: { role: "HEAD", isActive: true }, select: { id: true } })).map((u) => u.id);
}

// The sales person (or the back office for them) asks to hold units of
// items for a deal; the Head decides.
export async function requestReservation(dealId: string, lines: { productId: string; qty: number }[], reason: string): Promise<Result> {
  const user = await requireUser();
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, title: true, ownerId: true, stage: true } });
  if (!deal || !canAccessOwner(user, deal.ownerId)) return { error: "Deal not found." };
  if (deal.stage === "LOST") return { error: "This deal is lost." };
  const want = new Map<string, number>();
  for (const l of lines) {
    const q = Math.round(Number(l.qty) || 0);
    if (q > 0 && l.productId) want.set(l.productId, (want.get(l.productId) ?? 0) + q);
  }
  if (!want.size) return { error: "Pick at least one item and a quantity." };
  if (!reason.trim()) return { error: "Say why the stock should be held (e.g. advance expected Friday)." };

  await tidyReservations();
  const [available, mine, products] = await Promise.all([
    getAvailableStockByProduct({ exceptDealId: dealId }),
    prisma.stockReservation.groupBy({ by: ["productId"], where: { dealId, status: { in: ACTIVE_RESERVATION } }, _sum: { qty: true } }),
    prisma.product.findMany({ where: { id: { in: [...want.keys()] } }, select: { id: true, model: true } }),
  ]);
  for (const [productId, qty] of want) {
    const already = mine.find((m) => m.productId === productId)?._sum.qty ?? 0;
    const free = (available.get(productId) ?? 0) - already;
    const model = products.find((p) => p.id === productId)?.model ?? "this item";
    if (qty > free) return { error: free > 0 ? `Only ${free} of ${model} free to reserve${already ? ` (this deal already holds or asked for ${already})` : ""}.` : `${model} has no free stock to reserve.` };
  }
  await prisma.stockReservation.createMany({
    data: [...want].map(([productId, qty]) => ({ dealId, productId, qty, reason: reason.trim().slice(0, 500), requestedById: user.id })),
  });
  const summary = [...want].map(([id, q]) => `${q} x ${products.find((p) => p.id === id)?.model ?? "item"}`).join(", ");
  await audit("deal", dealId, user.id, "edited", `Stock reservation requested: ${summary}.`);
  after(async () => {
    await sendPush(await headIds(), { title: "Stock reservation request", body: `${user.name ?? "A sales person"}: ${summary} for ${deal.title}`, url: "/stock/reservations", tag: "reservation" });
  });
  refresh(dealId);
  return {};
}

// The Head approves (held RESERVATION_DAYS) or rejects, with a note.
export async function decideReservation(id: string, approve: boolean, note: string): Promise<Result> {
  const user = await requireUser();
  if (user.role !== "HEAD") return { error: "Only the Head of Sales approves stock reservations." };
  const r = await prisma.stockReservation.findUnique({ where: { id }, include: { product: { select: { model: true } }, deal: { select: { title: true } } } });
  if (!r || r.status !== "REQUESTED") return { error: "This request has already been decided." };
  if (!approve && !note.trim()) return { error: "Give a reason for rejecting." };
  if (approve) {
    await tidyReservations();
    const free = (await getAvailableStockByProduct()).get(r.productId) ?? 0;
    if (r.qty > free) return { error: `Only ${free} of ${r.product.model} free now - reject it or ask for fewer.` };
  }
  const now = new Date();
  await prisma.stockReservation.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", decidedById: user.id, decidedAt: now, decisionNote: note.trim().slice(0, 500) || null, expiresAt: approve ? holdUntil(now) : null, endedAt: approve ? null : now },
  });
  await audit("deal", r.dealId, user.id, "edited", `Stock reservation ${approve ? "approved" : "rejected"}: ${r.qty} x ${r.product.model}${note.trim() ? ` - ${note.trim()}` : ""}.`);
  after(async () => {
    await sendPush([r.requestedById], {
      title: approve ? "Stock reserved" : "Stock reservation rejected",
      body: `${r.qty} x ${r.product.model} for ${r.deal.title}${approve ? `, held ${RESERVATION_DAYS} days` : ""}${note.trim() ? ` - ${note.trim()}` : ""}`,
      url: `/deals/${r.dealId}`,
      tag: "reservation",
    });
  });
  refresh(r.dealId);
  return {};
}

// The Head holds it another RESERVATION_DAYS (from today, or from its
// current end if that's later).
export async function extendReservation(id: string): Promise<Result> {
  const user = await requireUser();
  if (user.role !== "HEAD") return { error: "Only the Head of Sales extends a reservation." };
  const r = await prisma.stockReservation.findUnique({ where: { id }, select: { status: true, expiresAt: true, dealId: true } });
  if (!r || r.status !== "APPROVED") return { error: "Only an active reservation can be extended." };
  const now = Date.now();
  const from = Math.max(now, r.expiresAt?.getTime() ?? now);
  await prisma.stockReservation.update({ where: { id }, data: { expiresAt: new Date(from + RESERVATION_DAYS * DAY) } });
  refresh(r.dealId);
  return {};
}

// Let the units go (the sales person, the back office), or withdraw a
// request.
export async function releaseReservation(id: string): Promise<Result> {
  const user = await requireUser();
  const r = await prisma.stockReservation.findUnique({ where: { id }, select: { status: true, dealId: true, requestedById: true, deal: { select: { ownerId: true } } } });
  if (!r || !ACTIVE_RESERVATION.includes(r.status)) return { error: "This reservation has already ended." };
  if (!isBackOffice(user) && !canAccessOwner(user, r.deal.ownerId) && r.requestedById !== user.id) return { error: "Not your reservation." };
  await prisma.stockReservation.update({ where: { id }, data: { status: "RELEASED", endedAt: new Date() } });
  refresh(r.dealId);
  return {};
}
