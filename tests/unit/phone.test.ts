import { describe, expect, it } from "vitest";
import { formatNgPhone, phoneLooksWrong } from "@/lib/phone";

describe("Nigerian phone numbers", () => {
  it("stores every way of typing a number the same way", () => {
    for (const t of ["0803 123 4567", "08031234567", "2348031234567", "+234 803 123 4567", "+234-803-123-4567", "8031234567"]) expect(formatNgPhone(t)).toBe("+234 803 123 4567");
  });
  it("keeps foreign and odd numbers as typed, and blanks as null", () => {
    expect(formatNgPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatNgPhone("01-2345678")).toBe("01-2345678");
    expect(formatNgPhone("  ")).toBeNull();
  });
  it("flags numbers worth a second look", () => {
    expect(phoneLooksWrong("0803 123 456")).toBe(true); // a digit short
    expect(phoneLooksWrong("0803 123 4567")).toBe(false);
    expect(phoneLooksWrong("+44 20 7946 0958")).toBe(false);
    expect(phoneLooksWrong("01-2345678")).toBe(false); // Lagos landline
    expect(phoneLooksWrong("")).toBe(false);
  });
});
