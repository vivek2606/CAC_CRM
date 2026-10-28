import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { priceAt, priceChangesSince } from "@/lib/pricing";
import { describeDb, makeProduct } from "./helpers";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

it("priceAt picks the latest price in effect on a date", () => {
  const pts = [
    { from: d("2026-10-01"), price: 100 },
    { from: d("2026-11-01"), price: 120 },
  ];
  expect(priceAt(pts, d("2026-10-20"))?.price).toBe(100);
  expect(priceAt(pts, d("2026-11-01"))?.price).toBe(120);
  // Before the first price: the first one.
  expect(priceAt(pts, d("2026-09-01"))?.price).toBe(100);
  expect(priceAt([], d("2026-09-01"))).toBeNull();
});

describeDb("price effective dates", () => {
  it("reports changes since a quote and upcoming increases", async () => {
    const p = await makeProduct("EFF-" + Date.now(), { dealerPrice: 1000 }); // Oct 2026
    await prisma.pricelist.create({ data: { productId: p.id, month: d("2026-11-01"), effectiveFrom: d("2026-11-10"), dealerPrice: 1100 } });
    await prisma.pricelist.create({ data: { productId: p.id, month: d("2026-12-01"), dealerPrice: 1250 } });
    const lines = [{ productId: p.id, description: "Unit" }];

    // Quoted 15 Oct, looked at 20 Nov: increased on 10 Nov, more coming 1 Dec.
    const c = await priceChangesSince(lines, d("2026-10-15"), d("2026-11-20"));
    expect(c).toEqual([
      expect.objectContaining({ from: 1000, to: 1100, upcoming: false, on: d("2026-11-10") }),
      expect.objectContaining({ from: 1100, to: 1250, upcoming: true, on: d("2026-12-01") }),
    ]);
    // The Nov price uploaded early doesn't apply before its date.
    const early = await priceChangesSince(lines, d("2026-10-15"), d("2026-11-05"));
    expect(early).toEqual([expect.objectContaining({ from: 1000, to: 1100, upcoming: true })]);
  });
});
