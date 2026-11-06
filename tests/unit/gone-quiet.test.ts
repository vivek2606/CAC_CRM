import { describe, expect, it } from "vitest";
import { quietCheck } from "@/lib/win-back";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const now = d("2026-11-06");

describe("gone quiet", () => {
  it("flags a monthly buyer silent for 4 months", () => {
    const r = quietCheck([d("2026-03-05"), d("2026-04-04"), d("2026-05-06"), d("2026-06-05"), d("2026-07-05")], now);
    expect(r.usualGapDays).toBe(30);
    expect(r.daysQuiet).toBe(124);
    expect(r.quiet).toBe(true);
  });
  it("doesn't flag a twice-a-year buyer after 4 months", () => {
    expect(quietCheck([d("2025-12-01"), d("2026-07-01")], now).quiet).toBe(false);
  });
  it("needs 2+ orders, 90+ days quiet, and not over a year", () => {
    expect(quietCheck([d("2026-05-01")], now).quiet).toBe(false);
    expect(quietCheck([d("2026-08-01"), d("2026-09-01")], now).quiet).toBe(false); // 66 days
    expect(quietCheck([d("2025-09-01"), d("2025-10-01")], now).quiet).toBe(false); // over a year: win-back list
  });
});
