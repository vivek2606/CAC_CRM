import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getUsdSales } from "@/lib/usd-sales";
import { describeDb, makeUser, makeProduct } from "./helpers";

describeDb("billing in USD", () => {
  it("converts each month's billing at its own rate, compares with last year and by category", async () => {
    // A far-off year of its own, so earlier runs' data doesn't mix in.
    const Y = 2200 + (Date.now() % 700);
    const L = Y - 1;
    const rep = await makeUser(`USD Rep ${Date.now()}`);
    const p = await makeProduct(`USD-${Date.now()}`);
    const d = (s: string) => new Date(`${s}T12:00:00Z`);
    for (const [m, rate] of [[`${Y}-03-01`, 1000], [`${L}-03-01`, 500]] as const)
      await prisma.monthlyExchangeRate.upsert({ where: { month: new Date(`${m}T00:00:00Z`) }, create: { month: new Date(`${m}T00:00:00Z`), rate }, update: { rate } });
    await prisma.target.create({ data: { userId: rep.id, month: new Date(`${Y}-03-01T00:00:00Z`), targetValue: 4_000_000 } });
    const now = await prisma.deal.create({ data: { title: "now", stage: "WON", value: 3_000_000, ownerId: rep.id, closedAt: d(`${Y}-03-10`) } });
    const ly = await prisma.deal.create({ data: { title: "ly", stage: "WON", value: 1_000_000, ownerId: rep.id, closedAt: d(`${L}-03-10`) } });
    await prisma.saleLineItem.create({ data: { sourceKey: `usd-a-${Date.now()}`, docDate: d(`${Y}-03-10`), month: new Date(`${Y}-03-01T00:00:00Z`), qty: 1, value: 3_000_000, productId: p.id, ownerId: rep.id, dealId: now.id } });
    await prisma.saleLineItem.create({ data: { sourceKey: `usd-b-${Date.now()}`, docDate: d(`${L}-03-10`), month: new Date(`${L}-03-01T00:00:00Z`), qty: 1, value: 1_000_000, productId: p.id, ownerId: rep.id, dealId: ly.id } });

    const u = await getUsdSales(`${Y}-03`);
    // Billed ₦3M at 1,000 = $3,000 vs target ₦4M = $4,000; last year ₦1M at 500 = $2,000.
    expect(u.current).toMatchObject({ sales: 3000, target: 4000, lySales: 2000, rate: 1000, lyRate: 500, provisional: false });
    expect(u.months.map((r) => r.key)).toEqual([`${Y}-01`, `${Y}-02`, `${Y}-03`]);
    expect(u.ytd).toMatchObject({ sales: 3000, target: 4000, lySales: 2000 });
    expect(u.categories).toEqual([{ category: "VRF", month: 3000, monthLy: 2000, ytd: 3000, ytdLy: 2000 }]);
    // February 2091 has no rate of its own: borrowed, marked provisional.
    expect(u.months.find((r) => r.key === `${Y}-02`)).toMatchObject({ provisional: true, rate: 1000 });
  });
});
