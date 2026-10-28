import { beforeAll, expect, it } from "vitest";
import { buildDocument, documentInputSchema, type DocumentInput } from "@/lib/sales-document";
import { excessDiscounts, noStockDiscounts } from "@/lib/quote-discount";
import { prisma } from "@/lib/prisma";
import { describeDb, makeProduct } from "./helpers";

const input = (rows: unknown[], extra: Partial<DocumentInput> = {}): DocumentInput =>
  documentInputSchema.parse({ type: "quote", companyKey: "SAKURAGI", ref: "", date: "2026-10-28", to: "Acme Ltd\nLagos", rows, ...extra });
const item = (o: Record<string, unknown>) => ({ kind: "item", description: "Item", qty: 1, unitPrice: 0, ...o });

describeDb("quotation totals", () => {
  it("adds VAT (7.5%) on the subtotal of net rates", async () => {
    const doc = await buildDocument(input([item({ qty: 2, unitPrice: 1_000_000, discountPct: 10 }), item({ description: "Pipes", qty: 3, unitPrice: 50_000 })]));
    // 2 x 900,000 + 3 x 50,000 = 1,950,000; VAT 146,250.
    expect(doc.subtotal).toBe(1_950_000);
    expect(doc.vat).toBe(146_250);
    expect(doc.total).toBe(2_096_250);
    expect(doc.totalInWords).toBe("Two Million, Ninety-Six Thousand, Two Hundred and Fifty Naira Only");
  });
  it("adds no VAT on top when rates are VAT-inclusive", async () => {
    const doc = await buildDocument(input([item({ qty: 1, unitPrice: 1_075_000 })], { vatMode: "inclusive" }));
    expect(doc.vat).toBe(0);
    expect(doc.total).toBe(1_075_000);
  });
  it("counts installation only when the installation column is on, and shows supply and installation", async () => {
    const rows = [item({ qty: 2, unitPrice: 100_000, installRate: 20_000 })];
    const off = await buildDocument(input(rows));
    expect(off.subtotal).toBe(200_000);
    const on = await buildDocument(input(rows, { withInstallation: true }));
    expect(on.subtotal).toBe(240_000);
    expect(on.installTotal).toBe(40_000);
    expect(on.supplyTotal).toBe(200_000);
  });
  it("rounds the rate to the kobo before multiplying, and leaves out empty lines", async () => {
    const doc = await buildDocument(input([item({ qty: 3, unitPrice: 333.333 }), item({ description: "", qty: 0, unitPrice: 0 }), { kind: "section", label: "" }]));
    expect(doc.rows).toHaveLength(1);
    // 333.333 -> 333.33 a unit; 3 units = 999.99.
    expect(doc.subtotal).toBe(999.99);
  });
  it("refuses negative quantities and rates (returns go through deals, not quotations)", () => {
    expect(() => input([item({ qty: -1, unitPrice: 100_000 })])).toThrow();
    expect(() => input([item({ qty: 1, unitPrice: -5 })])).toThrow();
  });
});

// Unique per run (the test database keeps earlier runs' data).
const NOSTOCK = `NOSTOCK-UNIT-${Date.now()}`;

describeDb("discount limits on quotations", () => {
  let capped: { id: string };
  let tentativeOnly: { id: string; model: string };
  beforeAll(async () => {
    capped = await makeProduct("CAPPED-UNIT", { maxDiscountPct: 10, dealerPrice: 1_000_000 });
    // In stock (so the max-discount rule applies, not the tentative one).
    await prisma.productStock.create({ data: { productId: capped.id, quantity: 5, asOfDate: new Date(Date.UTC(2026, 0, 1)) } });
    tentativeOnly = await makeProduct(NOSTOCK, { maxDiscountPct: 10, dealerPrice: 800_000 });
    await prisma.productStock.create({ data: { productId: tentativeOnly.id, quantity: 0, asOfDate: new Date(Date.UTC(2026, 0, 1)) } });
    await prisma.tentativePrice.create({ data: { model: NOSTOCK, category: "VRF", dealerPrice: 900_000 } });
  });
  it("flags a discount over the item's maximum, measured off the dealer's price", async () => {
    const ok = await buildDocument(input([item({ productId: capped.id, description: "CAPPED-UNIT", unitPrice: 1_000_000, discountPct: 10 })]));
    expect(await excessDiscounts(ok)).toEqual([]);
    const over = await buildDocument(input([item({ productId: capped.id, description: "CAPPED-UNIT", unitPrice: 1_000_000, discountPct: 12 })]));
    const lines = await excessDiscounts(over);
    expect(lines).toHaveLength(1);
    expect(lines[0].discountPct).toBe(12);
    expect(lines[0].maxPct).toBe(10);
  });
  it("counts a rate typed below the dealer's price as a discount too", async () => {
    const doc = await buildDocument(input([item({ productId: capped.id, description: "CAPPED-UNIT", unitPrice: 850_000 })]));
    expect((await excessDiscounts(doc))[0]?.discountPct).toBe(15);
  });
  it("compares VAT-inclusive rates with the dealer's price plus VAT", async () => {
    const doc = await buildDocument(input([item({ productId: capped.id, description: "CAPPED-UNIT", unitPrice: 1_075_000 * 0.9 })], { vatMode: "inclusive" }));
    expect(await excessDiscounts(doc)).toEqual([]);
  });
  it("allows no discount on an item not in stock - only the tentative rate", async () => {
    const atRate = await buildDocument(input([item({ productId: tentativeOnly.id, description: NOSTOCK, unitPrice: 900_000 })]));
    expect(await noStockDiscounts(atRate)).toEqual([]);
    const discounted = await buildDocument(input([item({ productId: tentativeOnly.id, description: NOSTOCK, unitPrice: 900_000, discountPct: 5 })]));
    expect(await noStockDiscounts(discounted)).toEqual([NOSTOCK]);
    const below = await buildDocument(input([item({ productId: tentativeOnly.id, description: NOSTOCK, unitPrice: 850_000 })]));
    expect(await noStockDiscounts(below)).toEqual([NOSTOCK]);
    // ...and it answers to that rule, not the max-discount one.
    expect(await excessDiscounts(below)).toEqual([]);
  });
});
