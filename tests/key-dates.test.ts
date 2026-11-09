import { expect, it } from "vitest";
import { daysUntil, fromDayMonth, dayMonthLabel, greeting } from "@/lib/key-dates-shared";

it("key dates: day and month only, next time round, 29 Feb", () => {
  expect(fromDayMonth("31", "2")).toBeNull();
  expect(fromDayMonth("", "5")).toBeNull();
  const d = fromDayMonth("12", "11")!;
  expect(dayMonthLabel(d)).toBe("12 Nov");
  expect(daysUntil(d, "2026-11-09")).toBe(3);
  expect(daysUntil(d, "2026-11-12")).toBe(0);
  // Passed this year -> next year.
  expect(daysUntil(d, "2026-11-13")).toBe(364);
  // 29 Feb on 28 Feb in a non-leap year.
  expect(daysUntil(fromDayMonth("29", "2")!, "2027-02-27")).toBe(1);
  expect(greeting({ firstName: "Ada", kind: "Wedding anniversary", from: "Priya", company: "Sakuragi" })).toContain("Happy wedding anniversary!");
});
