import { describe, expect, it } from "vitest";
import { isIssuedQuoteRef, nairaInWords, nameInitials, serialNumbers, isAvailabilityNote } from "@/lib/document-format";
import { netOf } from "@/lib/sales-document";
import { computeDealDiscount } from "@/lib/discount";
import { coveredByApproval, type ExcessLine } from "@/lib/quote-discount";
import { invoiceKey, invoiceTypeOf } from "@/lib/invoice-key";
import { closestBreakup, suggestBreakup } from "@/lib/modular-outdoor";
import { quoteChanges } from "@/lib/quote-diff";

describe("quote rates", () => {
  it("takes the discount off to the kobo", () => {
    expect(netOf(1_000_000, 10)).toBe(900_000);
    expect(netOf(999.99, 12.5)).toBe(874.99);
    expect(netOf(1234.56, 0)).toBe(1234.56);
    expect(netOf(100, 100)).toBe(0);
  });
});

describe("serial numbers", () => {
  it("numbers items 1, 2, 3 with no sections; sections A, B with i, ii under each", () => {
    expect(serialNumbers([{ kind: "item" }, { kind: "item" }])).toEqual(["1", "2"]);
    expect(serialNumbers([{ kind: "section" }, { kind: "item" }, { kind: "item" }, { kind: "section" }, { kind: "item" }])).toEqual(["A", "i", "ii", "B", "i"]);
  });
});

describe("amount in words", () => {
  it("spells naira and kobo", () => {
    expect(nairaInWords(1_250_500.5)).toBe("One Million, Two Hundred and Fifty Thousand, Five Hundred Naira and Fifty Kobo Only");
    expect(nairaInWords(1005)).toBe("One Thousand and Five Naira Only");
    expect(nairaInWords(-20)).toBe("Minus Twenty Naira Only");
  });
  it("rounds to the nearest kobo", () => {
    expect(nairaInWords(0.999)).toBe("One Naira Only");
  });
});

describe("quotation numbers", () => {
  it("recognises SNIL/CAC/LAG/<initials>/<year>/<no.>", () => {
    expect(isIssuedQuoteRef("SNIL/CAC/LAG/VK/2026/0021")).toBe(true);
    expect(isIssuedQuoteRef("SNIL/CAC/LAG/VK/2026/12345")).toBe(true);
    expect(isIssuedQuoteRef("SNL/VIV/20262109")).toBe(false);
    expect(isIssuedQuoteRef("DRAFT-abc")).toBe(false);
  });
  it("uses first and last initials", () => {
    expect(nameInitials("Chris Mokobia")).toBe("CM");
    expect(nameInitials("Odujebe Oluwabunmi Aminat")).toBe("OA");
    expect(nameInitials("Vivek")).toBe("VI");
    expect(nameInitials("  ")).toBe("XX");
  });
  it("spots availability notes (hidden when availability is off)", () => {
    expect(isAvailabilityNote("In Transit (ETA March)")).toBe(true);
    expect(isAvailabilityNote("Copper pipes by client")).toBe(false);
  });
});

describe("deal discount approval", () => {
  const ref = new Map([["p1", 1000], ["p2", 500]]);
  it("needs approval above 15% off the catalog price", () => {
    const d = computeDealDiscount([{ productId: "p1", qty: 10, unitPrice: 840 }], ref, null)!;
    expect(d.discountPct).toBeCloseTo(16);
    expect(d.needsApproval).toBe(true);
    expect(computeDealDiscount([{ productId: "p1", qty: 10, unitPrice: 850 }], ref, null)!.needsApproval).toBe(false);
  });
  it("is cleared once approved", () => {
    expect(computeDealDiscount([{ productId: "p1", qty: 1, unitPrice: 100 }], ref, new Date())!.needsApproval).toBe(false);
  });
  it("ignores return lines and items with no catalog price; selling above list is no discount", () => {
    const d = computeDealDiscount(
      [
        { productId: "p1", qty: 1, unitPrice: 1200 },
        { productId: "p2", qty: -1, unitPrice: 500 },
        { productId: "px", qty: 5, unitPrice: 1 },
      ],
      ref,
      null,
    )!;
    expect(d.referenceTotal).toBe(1000);
    expect(d.discountPct).toBe(0);
    expect(computeDealDiscount([{ productId: "px", qty: 1, unitPrice: 1 }], ref, null)).toBeNull();
  });
});

describe("quote discount approvals", () => {
  const line = (productId: string, discountPct: number): ExcessLine => ({ productId, description: productId, listRate: 100, netRate: 100 - discountPct, discountPct, maxPct: 10 });
  it("lets a download through only within what the Head approved, per item", () => {
    expect(coveredByApproval([], null)).toBe(true);
    expect(coveredByApproval([line("a", 15)], [line("a", 15)])).toBe(true);
    expect(coveredByApproval([line("a", 12)], [line("a", 15)])).toBe(true);
    expect(coveredByApproval([line("a", 16)], [line("a", 15)])).toBe(false);
    expect(coveredByApproval([line("b", 12)], [line("a", 15)])).toBe(false);
    expect(coveredByApproval([line("a", 12)], "nonsense")).toBe(false);
  });
});

describe("invoice keys", () => {
  it("keeps a sale and a return with the same number apart, and per entity", () => {
    expect(invoiceTypeOf(-1)).toBe("return");
    expect(invoiceTypeOf(0)).toBe("sale");
    expect(invoiceKey("Sakuragi", "sale", "100")).not.toBe(invoiceKey("Somotex", "sale", "100"));
    expect(invoiceKey("Sakuragi", "sale", "100")).not.toBe(invoiceKey("Sakuragi", "return", "100"));
    expect(invoiceKey("Sakuragi", "sale", " 100 ")).toBe(invoiceKey("Sakuragi", "sale", "100"));
  });
});

describe("modular outdoor break-up", () => {
  it("adds up to the capacity exactly when it can", () => {
    const caps = [850, 785, 730, 670, 615, 560, 335, 280, 224];
    const b = suggestBreakup(2250, caps)!;
    expect(b.reduce((s, c) => s + c, 0)).toBe(2250);
    expect(b.length).toBeLessThanOrEqual(3);
  });
  it("gives the closest otherwise (not under when it can be over)", () => {
    const r = closestBreakup(2000, [670])!;
    expect(r.exact).toBe(false);
    expect(r.caps.reduce((s, c) => s + c, 0)).toBe(2010);
  });
});

describe("quote change history", () => {
  it("lists line changes by description", () => {
    const before = { to: "Acme\nLagos", rows: [{ kind: "item", description: "VRF", qty: 1, unitPrice: 100 }, { kind: "item", description: "Pipes", qty: 1, unitPrice: 5 }] };
    const after = { to: "Acme\nAbuja", rows: [{ kind: "item", description: "VRF", qty: 2, unitPrice: 90, discountPct: 5 }, { kind: "item", description: "Labour", qty: 1, unitPrice: 7 }] };
    expect(quoteChanges(before, after)).toEqual([
      "Customer address / phone changed",
      "Line VRF: qty 1 → 2, rate ₦100 → ₦90, discount 0% → 5%",
      "Line added: Labour - 1 × ₦7",
      "Line removed: Pipes - 1 × ₦5",
    ]);
  });
});
