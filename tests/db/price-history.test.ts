import { expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { documentInputSchema } from "@/lib/sales-document";
import { describeDb, makeProduct, makeUser } from "./helpers";

vi.mock("@/lib/rbac", () => ({ requireUser: async () => ({ id: "u", role: "SALES_MANAGER" }), canAccessOwner: () => true, isBackOffice: () => false }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

describeDb("customer price history", () => {
  it("gives the customer's last quoted and invoiced rate per product, excl. VAT", async () => {
    const { customerPriceHistory } = await import("@/app/(app)/quotations/actions");
    const rep = await makeUser("PH Rep");
    const p = await makeProduct(`PH-${Date.now()}`);
    const acc = await prisma.account.create({ data: { name: `PH Cust ${Date.now()}`, ownerId: rep.id } });
    const doc = (rate: number, vatMode: "separate" | "inclusive", discountPct = 0) =>
      documentInputSchema.parse({ type: "quote", companyKey: "SAKURAGI", ref: "", date: "2026-11-01", to: acc.name, accountId: acc.id, vatMode, rows: [{ kind: "item", productId: p.id, description: p.model, qty: 1, unitPrice: rate, discountPct }] });
    await prisma.quotation.create({ data: { ref: `PH/${Date.now()}/1`, type: "quote", customerName: acc.name, total: 1, ownerId: rep.id, createdById: rep.id, data: doc(1000, "separate"), updatedAt: new Date("2026-09-01T00:00:00Z") } });
    // Newer, VAT-inclusive with 10% off: 1,075 incl. -> 967.50 incl. -> 900 excl.
    await prisma.quotation.create({ data: { ref: `PH/${Date.now()}/2`, type: "quote", customerName: acc.name, total: 1, ownerId: rep.id, createdById: rep.id, data: doc(1075, "inclusive", 10) } });
    const deal = await prisma.deal.create({ data: { title: "ph", stage: "WON", value: 1900, ownerId: rep.id, accountId: acc.id, invoiceNo: "PH-INV-1", closedAt: new Date("2026-10-03T00:00:00Z") } });
    await prisma.saleLineItem.create({ data: { sourceKey: `ph-${Date.now()}`, docDate: new Date("2026-10-03T00:00:00Z"), month: new Date("2026-10-01T00:00:00Z"), qty: 2, value: 1900, productId: p.id, ownerId: rep.id, dealId: deal.id } });

    const h = (await customerPriceHistory(acc.id, acc.name))[p.id];
    expect(h.quoted?.rate).toBe(900);
    expect(h.invoiced).toEqual({ rate: 950, date: "2026-10-03", ref: "PH-INV-1" });
    expect(await customerPriceHistory("", "ab")).toEqual({});
  });
});
