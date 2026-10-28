import { beforeAll, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { syncSaleLineItemsForDeal } from "@/lib/sale-line-sync";
import { computeMonthIncentives } from "@/lib/incentive-month";
import { DEFAULT_INCENTIVE_SETTINGS } from "@/lib/incentive";
import { describeDb, makeProduct, makeUser } from "./helpers";

const OCT = new Date(Date.UTC(2026, 9, 1));

describeDb("Sales Register lines from won deals", () => {
  it("bills a won deal's products at qty x rate on its invoice date, keeps the deal's value in step, and clears them when it's no longer won", async () => {
    const rep = await makeUser("Register Rep");
    const a = await makeProduct("REG-A");
    const b = await makeProduct("REG-B");
    const deal = await prisma.deal.create({
      data: { title: "Register deal", stage: "WON", value: 0, probability: 100, ownerId: rep.id, closedAt: new Date(Date.UTC(2026, 9, 15)) },
    });
    await prisma.dealLineItem.createMany({
      data: [
        { dealId: deal.id, productId: a.id, qty: 2, unitPrice: 1_500_000 },
        { dealId: deal.id, productId: b.id, qty: -1, unitPrice: 400_000 }, // a return
      ],
    });
    await syncSaleLineItemsForDeal(deal.id);
    const lines = await prisma.saleLineItem.findMany({ where: { dealId: deal.id } });
    expect(lines).toHaveLength(2);
    expect(lines.reduce((s, l) => s + l.value, 0)).toBe(2_600_000);
    expect(lines.every((l) => l.docDate.toISOString().startsWith("2026-10-15") && l.month.getTime() === OCT.getTime())).toBe(true);
    expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).value).toBe(2_600_000);

    // Changing a quantity updates the line, not adds one.
    await prisma.dealLineItem.updateMany({ where: { dealId: deal.id, productId: a.id }, data: { qty: 3 } });
    await syncSaleLineItemsForDeal(deal.id);
    const after = await prisma.saleLineItem.findMany({ where: { dealId: deal.id } });
    expect(after).toHaveLength(2);
    expect(after.reduce((s, l) => s + l.value, 0)).toBe(4_100_000);

    await prisma.deal.update({ where: { id: deal.id }, data: { stage: "NEGOTIATION" } });
    await syncSaleLineItemsForDeal(deal.id);
    expect(await prisma.saleLineItem.count({ where: { dealId: deal.id } })).toBe(0);
  });
});

describeDb("monthly incentives", () => {
  beforeAll(async () => {
    // Only these reps count this month.
    await prisma.user.updateMany({ where: { title: "Sales Manager" }, data: { isActive: false } });
    await prisma.appSetting.deleteMany({ where: { key: "incentive" } });
  });
  it("pays on won deals plus project billing against the month's target, and shares the pool", async () => {
    const hit = await makeUser("Target Hitter");
    const near = await makeUser("Near Miss");
    const none = await makeUser("No Target");
    for (const [u, t] of [
      [hit, 100_000_000],
      [near, 100_000_000],
    ] as const)
      await prisma.target.create({ data: { userId: u.id, month: OCT, targetValue: t } });
    const won = (ownerId: string, value: number, day: number) =>
      prisma.deal.create({ data: { title: "Won", stage: "WON", value, probability: 100, ownerId, closedAt: new Date(Date.UTC(2026, 9, day)) } });
    await won(hit.id, 80_000_000, 3);
    await won(near.id, 85_000_000, 20);
    await won(none.id, 50_000_000, 5);
    // Outside the month - doesn't count.
    await prisma.deal.create({ data: { title: "Nov", stage: "WON", value: 999_000_000, probability: 100, ownerId: hit.id, closedAt: new Date(Date.UTC(2026, 10, 1)) } });
    // Lost - doesn't count.
    await prisma.deal.create({ data: { title: "Lost", stage: "LOST", value: 999_000_000, probability: 0, ownerId: near.id, closedAt: new Date(Date.UTC(2026, 9, 9)) } });
    await prisma.projectBilling.create({
      data: { sourceKey: `manual:test-${Date.now()}`, docKey: "PB/1", txnNo: 1, docDate: new Date(Date.UTC(2026, 9, 10)), month: OCT, custName: "Acme", itemCode: "SVC", itemName: "Installation", value: 25_000_000, ownerId: hit.id },
    });

    const { rows, support } = await computeMonthIncentives(OCT);
    const by = (u: { id: string }) => rows.find((r) => r.userId === u.id)!;
    // 80M won + 25M project billing = 105% -> 0.5% of 105M.
    expect(by(hit).sales).toBe(105_000_000);
    expect(by(hit).incentive).toBeCloseTo(525_000);
    expect(by(hit).payout).toBeCloseTo(420_000);
    // 85% - below every tier.
    expect(by(near).rate).toBe(0);
    expect(by(near).incentive).toBe(0);
    // No target - not eligible.
    expect(by(none).achievement).toBeNull();
    expect(by(none).incentive).toBe(0);
    // The 20% pool (105,000): coordinator 50,000, the rest split three ways.
    const coord = support.find((s) => s.coordinator)!;
    expect(coord.amount).toBe(50_000);
    expect(support.filter((s) => !s.coordinator).every((s) => Math.abs(s.amount - 55_000 / 3) < 0.01)).toBe(true);
    expect(support.length).toBe(DEFAULT_INCENTIVE_SETTINGS.supportStaff.length);
  });
});
