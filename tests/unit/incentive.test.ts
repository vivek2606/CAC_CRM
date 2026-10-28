import { describe, expect, it } from "vitest";
import { DEFAULT_INCENTIVE_SETTINGS as S, calculateSalesIncentive, distributeSupportPool, rateFor, type IncentiveSettings } from "@/lib/incentive";
import { snapshotOf, totalPayable } from "@/lib/incentive-approval";

const rep = (target: number, productSales: number, projectSales = 0, name = "Rep One", userId = "u1") =>
  calculateSalesIncentive({ userId, name, target, productSales, projectSales }, S);

describe("incentive rate tiers", () => {
  it("pays the highest tier met: >= 100% -> 0.5%, >= 90% -> 0.4%, below -> nothing", () => {
    expect(rateFor(1.2, S)).toBe(0.005);
    expect(rateFor(1, S)).toBe(0.005);
    expect(rateFor(0.95, S)).toBe(0.004);
    expect(rateFor(0.9, S)).toBe(0.004);
    expect(rateFor(0.8999, S)).toBe(0);
  });
  it("doesn't drop an exact threshold to the tier below because of floating-point noise", () => {
    expect(rateFor(90_000_000 / 100_000_000 - 1e-12, S)).toBe(0.004);
  });
  it("is not eligible without a target", () => {
    expect(rateFor(null, S)).toBe(0);
    expect(rep(0, 50_000_000).rate).toBe(0);
    expect(rep(0, 50_000_000).incentive).toBe(0);
  });
});

describe("sales person's incentive", () => {
  it("counts product sales plus project billing toward achievement", () => {
    const r = rep(100_000_000, 80_000_000, 15_000_000);
    expect(r.sales).toBe(95_000_000);
    expect(r.achievement).toBeCloseTo(0.95);
    expect(r.rate).toBe(0.004);
    expect(r.incentive).toBeCloseTo(380_000);
  });
  it("keeps 80% for the sales person and puts 20% in the support pool", () => {
    const r = rep(100_000_000, 120_000_000);
    expect(r.incentive).toBeCloseTo(600_000);
    expect(r.payout).toBeCloseTo(480_000);
    expect(r.toPool).toBeCloseTo(120_000);
    expect(r.payout + r.toPool).toBeCloseTo(r.incentive);
  });
  it("pays salary support on top for named sales people (by name or login)", () => {
    const byName = rep(100_000_000, 100_000_000, 0, "  chris   MOKOBIA ");
    expect(byName.salarySupportPct).toBe(100);
    expect(byName.salarySupport).toBeCloseTo(500_000);
    expect(byName.totalToReceive).toBeCloseTo(400_000 + 500_000);
    const settings: IncentiveSettings = { ...S, salarySupport: [{ name: "Someone Else", userId: "u9", pct: 50 }] };
    const byLogin = calculateSalesIncentive({ userId: "u9", name: "Renamed", target: 100, productSales: 100 }, settings);
    expect(byLogin.salarySupport).toBeCloseTo(0.25);
  });
  it("never pays on net returns", () => {
    const r = rep(100, -500);
    expect(r.incentive).toBe(0);
    expect(r.payout).toBe(0);
  });
});

describe("support staff pool", () => {
  it("gives the coordinator the first ₦50,000 and splits the rest equally", () => {
    const shares = distributeSupportPool(200_000, S);
    expect(shares.find((s) => s.coordinator)!.amount).toBe(50_000);
    for (const s of shares.filter((s) => !s.coordinator)) expect(s.amount).toBeCloseTo(50_000);
    expect(shares.reduce((t, s) => t + s.amount, 0)).toBeCloseTo(200_000);
  });
  it("gives a pool under ₦50,000 wholly to the coordinator", () => {
    const shares = distributeSupportPool(30_000, S);
    expect(shares.find((s) => s.coordinator)!.amount).toBe(30_000);
    expect(shares.filter((s) => !s.coordinator).every((s) => s.amount === 0)).toBe(true);
  });
  it("splits among everyone when there's no coordinator", () => {
    const settings: IncentiveSettings = { ...S, supportStaff: S.supportStaff.map((s) => ({ ...s, coordinator: false })) };
    const shares = distributeSupportPool(100_000, settings);
    expect(shares.every((s) => s.amount === 25_000)).toBe(true);
  });
});

describe("approved snapshot", () => {
  it("rounds to the kobo and totals what's payable (sales team + support)", () => {
    const rows = [rep(100_000_000, 100_000_001), rep(90_000_000, 85_000_000, 0, "Rep Two", "u2")];
    const pool = rows.reduce((t, r) => t + r.toPool, 0);
    const snap = snapshotOf(rows, distributeSupportPool(pool, S), S);
    expect(snap.rows[0].incentive).toBe(500_000.01);
    // Rep Two is at 94.4%: 0.4% of 85M = 340,000; 80% = 272,000 to them.
    expect(snap.rows[1].payout).toBe(272_000);
    const expected = snap.rows.reduce((t, r) => t + r.totalToReceive, 0) + snap.support.reduce((t, s) => t + s.amount, 0);
    expect(totalPayable(snap)).toBeCloseTo(expected, 2);
  });
});
