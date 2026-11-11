import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getStockToSell, getIncoming } from "@/lib/stock-selling";
import { describeDb, makeUser, makeProduct } from "./helpers";

const DAY = 86400000;

describeDb("stock to sell", () => {
  it("flags aged and slow stock with past buyers, and who's waiting for arrivals", async () => {
    const now = new Date("2026-11-11T10:00:00Z");
    const ago = (d: number) => new Date(now.getTime() - d * DAY);
    const rep = await makeUser(`SS Rep ${Date.now()}`);
    const other = await makeUser(`SS Other ${Date.now()}`);
    const aged = await makeProduct(`SS-AGED-${Date.now()}`);
    const moving = await makeProduct(`SS-MOVING-${Date.now()}`);
    // Aged: counted 10 on a stock count 300 days ago, 4 more arrived 20 days ago -> oldest units over 300 days.
    await prisma.productStock.create({ data: { productId: aged.id, quantity: 10, asOfDate: ago(300) } });
    await prisma.stockReceipt.create({ data: { productId: aged.id, quantity: 4, receivedAt: ago(20), createdById: rep.id } });
    // Moving: 5 in stock from 10 days ago, selling 6 a month.
    await prisma.productStock.create({ data: { productId: moving.id, quantity: 0, asOfDate: ago(400) } });
    await prisma.stockReceipt.create({ data: { productId: moving.id, quantity: 41, receivedAt: ago(10), createdById: rep.id } });
    const acct = await prisma.account.create({ data: { name: `SS Buyer ${Date.now()}`, ownerId: rep.id, phone: "08031234567" } });
    const acct2 = await prisma.account.create({ data: { name: `SS Other Buyer ${Date.now()}`, ownerId: other.id } });
    const d1 = await prisma.deal.create({ data: { title: "past", stage: "WON", value: 1, ownerId: rep.id, accountId: acct.id, closedAt: ago(400) } });
    const d2 = await prisma.deal.create({ data: { title: "past2", stage: "WON", value: 1, ownerId: other.id, accountId: acct2.id, closedAt: ago(500) } });
    let k = 0;
    const line = (productId: string, dealId: string, ownerId: string, qty: number, daysAgo: number) =>
      prisma.saleLineItem.create({ data: { sourceKey: `ss-${Date.now()}-${k++}`, docDate: ago(daysAgo), month: ago(daysAgo), qty, value: qty * 100_000, productId, ownerId, dealId } });
    await line(aged.id, d1.id, rep.id, 3, 400);
    await line(aged.id, d2.id, other.id, 2, 500);
    for (let m = 1; m <= 6; m++) await line(moving.id, d1.id, rep.id, 6, m * 30 - 20);

    const all = (await getStockToSell(null, now)).filter((r) => [aged.id, moving.id].includes(r.productId));
    expect(all.map((r) => r.productId)).toEqual([aged.id]);
    const a = all[0];
    expect(a).toMatchObject({ free: 14, aged: true, slow: true, ageIsAtLeast: true, oldestDays: 300, coverMonths: null });
    expect(a.buyers.map((b) => [b.ownerName, b.qty])).toEqual([[rep.name, 3], [other.name, 2]]);
    expect(a.buyers[0].lastRate).toBe(100_000);
    // A sales person sees only their own customers.
    const mine = (await getStockToSell([rep.id], now)).find((r) => r.productId === aged.id)!;
    expect(mine.buyers.map((b) => b.name)).toEqual([acct.name]);

    // Arriving: an in-transit order, a pending order and a deal lost for no stock.
    await prisma.inTransitOrder.create({ data: { productId: moving.id, quantity: 20, eta: new Date(now.getTime() + 15 * DAY), createdById: rep.id } });
    await prisma.pendingOrder.create({ data: { productId: moving.id, quantity: 4, customerName: "Waiting Co", paymentReceived: true, ownerId: rep.id } });
    const lost = await prisma.deal.create({ data: { title: "lost", stage: "LOST", value: 1, ownerId: other.id, lostReasonCategory: "PRODUCT_NOT_AVAILABLE", closedAt: ago(30), customerName: "Lost Co" } });
    await prisma.dealLineItem.create({ data: { dealId: lost.id, productId: moving.id, qty: 2, unitPrice: 1 } });
    const coming = (await getIncoming(null, now)).filter((i) => i.productId === moving.id);
    // Arrived 10 days ago and in transit - both with the same two waiting.
    expect(coming.map((i) => i.arrived)).toEqual([true, false]);
    expect(coming[1].waiting.map((w) => [w.kind, w.customer, w.qty])).toEqual([["pending", "Waiting Co", 4], ["lost", "Lost Co", 2]]);
    expect((await getIncoming([rep.id], now)).find((i) => i.productId === moving.id)!.waiting.map((w) => w.customer)).toEqual(["Waiting Co"]);
  });
});
