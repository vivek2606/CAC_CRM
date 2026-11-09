import { expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { describeDb, makeUser, makeProduct } from "./helpers";

const state = vi.hoisted(() => ({ userId: "", role: "SALES_MANAGER" }));
vi.mock("@/lib/rbac", () => ({
  requireUser: async () => ({ id: state.userId, role: state.role, name: "T" }),
  canAccessOwner: () => true,
  isBackOffice: () => state.role !== "SALES_MANAGER",
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/push", () => ({ sendPush: async () => 0 }));

describeDb("stock reservations", () => {
  it("requests, Head approval, stock taken off available, then fulfilled on invoice", async () => {
    const { requestReservation, decideReservation, extendReservation } = await import("@/app/(app)/stock/reservations/actions");
    const { getAvailableStockByProduct } = await import("@/lib/pricing");
    const { tidyReservations } = await import("@/lib/reservations");
    const rep = await makeUser(`Res Rep ${Date.now()}`);
    const head = await prisma.user.create({ data: { name: "H", email: `h-${Date.now()}@test.local`, passwordHash: "x", role: "HEAD", title: "Head of Sales" } });
    const p = await makeProduct(`RES-${Date.now()}`);
    await prisma.productStock.create({ data: { productId: p.id, quantity: 10, asOfDate: new Date(Date.UTC(2026, 0, 1)) } });
    const deal = await prisma.deal.create({ data: { title: "Res deal", stage: "NEGOTIATION", value: 1, ownerId: rep.id } });
    const other = await prisma.deal.create({ data: { title: "Other", stage: "NEGOTIATION", value: 1, ownerId: rep.id } });

    state.userId = rep.id;
    state.role = "SALES_MANAGER";
    expect((await requestReservation(deal.id, [{ productId: p.id, qty: 11 }], "advance Friday")).error).toMatch(/Only 10/);
    expect((await requestReservation(deal.id, [{ productId: p.id, qty: 4 }], "")).error).toMatch(/why/);
    expect((await requestReservation(deal.id, [{ productId: p.id, qty: 4 }], "advance Friday")).error).toBeUndefined();
    const r = await prisma.stockReservation.findFirstOrThrow({ where: { dealId: deal.id } });
    // A sales person can't approve; a request alone doesn't hold stock.
    expect((await decideReservation(r.id, true, "")).error).toMatch(/Head/);
    expect((await getAvailableStockByProduct()).get(p.id)).toBe(10);

    state.userId = head.id;
    state.role = "HEAD";
    expect((await decideReservation(r.id, false, "")).error).toMatch(/reason/);
    expect((await decideReservation(r.id, true, "ok")).error).toBeUndefined();
    const approved = await prisma.stockReservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(approved.status).toBe("APPROVED");
    expect(Math.round((approved.expiresAt!.getTime() - approved.decidedAt!.getTime()) / 86400000)).toBe(14);
    // Held for this deal: 6 free for others, all 10 for the deal itself, 10 on the quote check.
    expect((await getAvailableStockByProduct()).get(p.id)).toBe(6);
    expect((await getAvailableStockByProduct({ exceptDealId: deal.id })).get(p.id)).toBe(10);
    expect((await getAvailableStockByProduct({ gross: true })).get(p.id)).toBe(10);
    // Another deal can't take more than what's free.
    state.userId = rep.id;
    state.role = "SALES_MANAGER";
    expect((await requestReservation(other.id, [{ productId: p.id, qty: 7 }], "x")).error).toMatch(/Only 6/);

    state.userId = head.id;
    state.role = "HEAD";
    await extendReservation(r.id);
    const ext = await prisma.stockReservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(Math.round((ext.expiresAt!.getTime() - approved.expiresAt!.getTime()) / 86400000)).toBe(14);

    // Invoiced on the deal -> fulfilled, and the stock is billed instead.
    await prisma.saleLineItem.create({ data: { sourceKey: `res-${r.id}`, docDate: new Date(), month: new Date(Date.UTC(2026, 10, 1)), qty: 4, value: 1, productId: p.id, ownerId: rep.id, dealId: deal.id } });
    await tidyReservations();
    expect((await prisma.stockReservation.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("FULFILLED");
    expect((await getAvailableStockByProduct()).get(p.id)).toBe(6);
  });

  it("expires past its date and releases when the deal is lost", async () => {
    const { tidyReservations } = await import("@/lib/reservations");
    const rep = await makeUser(`Res Rep2 ${Date.now()}`);
    const p = await makeProduct(`RES2-${Date.now()}`);
    const lost = await prisma.deal.create({ data: { title: "Lost", stage: "LOST", value: 1, ownerId: rep.id } });
    const open = await prisma.deal.create({ data: { title: "Open", stage: "PROPOSAL", value: 1, ownerId: rep.id } });
    const a = await prisma.stockReservation.create({ data: { dealId: lost.id, productId: p.id, qty: 1, requestedById: rep.id, status: "REQUESTED" } });
    const b = await prisma.stockReservation.create({ data: { dealId: open.id, productId: p.id, qty: 1, requestedById: rep.id, status: "APPROVED", expiresAt: new Date(Date.now() - 1000) } });
    await tidyReservations();
    expect((await prisma.stockReservation.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("RELEASED");
    expect((await prisma.stockReservation.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("EXPIRED");
  });
});
