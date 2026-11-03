import { expect, it } from "vitest";
import { amcCovers, amcStatus, defaultEnd, visitPlan } from "@/lib/amc";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

it("plans the visits evenly over the contract", () => {
  const start = d("2026-11-15");
  const end = defaultEnd(start);
  expect(iso(end)).toBe("2027-11-14");
  expect(visitPlan(start, end, 4).map(iso)).toEqual(["2026-11-15", "2027-02-15", "2027-05-15", "2027-08-15"]);
  expect(visitPlan(start, end, 2).map(iso)).toEqual(["2026-11-15", "2027-05-15"]);
  expect(visitPlan(start, end, 12)).toHaveLength(12);
});

it("works out the status and cover", () => {
  const c = { startDate: d("2026-01-01"), endDate: d("2026-12-31"), cancelled: false };
  expect(amcStatus(c, d("2026-06-01"))).toBe("ACTIVE");
  expect(amcStatus(c, d("2026-12-10"))).toBe("RENEWAL_DUE");
  expect(amcStatus(c, d("2027-01-05"))).toBe("EXPIRED");
  expect(amcStatus({ ...c, cancelled: true }, d("2026-06-01"))).toBe("CANCELLED");
  expect(amcCovers(c, d("2026-12-31"))).toBe(true);
  expect(amcCovers(c, d("2027-01-03"))).toBe(false);
});
