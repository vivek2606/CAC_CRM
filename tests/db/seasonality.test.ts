import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getSeasonality, splitByPattern, ALL } from "@/lib/seasonality";
import { describeDb, makeUser } from "./helpers";

it("splits a yearly target by a pattern, keeping the total exact", () => {
  const share = [20, 20, 10, 10, 5, 5, 5, 5, 5, 5, 5, 5];
  const parts = splitByPattern(1_000_000, share);
  expect(parts[0]).toBe(200_000);
  expect(parts.reduce((s, v) => s + v, 0)).toBe(1_000_000);
  expect(splitByPattern(1200, Array(12).fill(0))).toEqual(Array(12).fill(100));
});

describeDb("seasonality", () => {
  it("averages each month's share over the complete years, finds peaks and when to order", async () => {
    // Years of their own, so other tests' data stays out.
    const Y = 3000 + (Date.now() % 900);
    const rep = await makeUser(`Season Rep ${Date.now()}`);
    const cat = `SEASON-${Date.now()}`;
    const p = await prisma.product.create({ data: { code: `SZ-${Date.now()}`, brand: "Midea", category: cat, subCategory: "x", model: `SZ-${Date.now()}` } });
    let k = 0;
    const line = (y: number, m: number, value: number, qty = 1) =>
      prisma.saleLineItem.create({ data: { sourceKey: `sz-${Date.now()}-${k++}`, docDate: new Date(Date.UTC(y, m, 10)), month: new Date(Date.UTC(y, m, 1)), qty, value, productId: p.id, ownerId: rep.id } });
    // Each complete year: half in March, the rest spread over Jan, Feb, Apr, May, Jun (10% each).
    for (const y of [Y - 3, Y - 2, Y - 1]) {
      await line(y, 2, 500);
      for (const m of [0, 1, 3, 4, 5]) await line(y, m, 100);
    }
    await line(Y, 0, 999); // this year so far: shown, not in the average
    const s = await getSeasonality("value", new Date(Date.UTC(Y, 5, 1)));
    expect(s.complete).toEqual([Y - 3, Y - 2, Y - 1]);
    const r = s.rows.find((x) => x.category === cat)!;
    expect(r.share.map((v) => Math.round(v))).toEqual([10, 10, 50, 10, 10, 10, 0, 0, 0, 0, 0, 0]);
    expect(r.yearly).toBe(1000);
    // Peaks well above 8.3%: March first; order 3 months ahead.
    expect(r.peaks[0]).toBe(2);
    expect(r.orderBy[0]).toBe(11);
    expect(r.byYear[Y][0]).toBe(999);
    expect(s.rows[0].category).toBe(ALL);
  });
});
