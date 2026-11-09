import { expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { documentInputSchema } from "@/lib/sales-document";
import { describeDb, makeProduct, makeUser } from "./helpers";

const state = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/rbac", () => ({
  requireUser: async () => ({ id: state.userId, role: "SALES_MANAGER" }),
  canAccessOwner: () => true,
  isBackOffice: () => false,
  visibleOwnerIds: async () => [state.userId],
  canDownloadQuoteExcel: () => false,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/push", () => ({ sendPush: async () => 0, pushToRole: async () => 0 }));

const doc = (rows: unknown[]) =>
  documentInputSchema.parse({ type: "quote", companyKey: "SAKURAGI", ref: "", date: "2026-11-09", to: "Acme Ltd", vatMode: "separate", rows });

describeDb("deal products from its quotation", () => {
  it("follows the latest quotation and can't be edited by hand", async () => {
    const { applyQuoteToDeal, addDealLineItem } = await import("@/app/(app)/deals/actions");
    const rep = await makeUser("DQ Rep");
    state.userId = rep.id;
    const a = await makeProduct(`DQ-A-${Date.now()}`);
    const b = await makeProduct(`DQ-B-${Date.now()}`);
    const deal = await prisma.deal.create({ data: { title: "dq", stage: "PROPOSAL", value: 1, ownerId: rep.id } });
    const q1 = await prisma.quotation.create({
      data: { ref: `DQ/${Date.now()}/1`, type: "quote", customerName: "Acme", total: 1, ownerId: rep.id, createdById: rep.id, dealId: deal.id, data: doc([{ kind: "item", productId: a.id, description: a.model, qty: 2, unitPrice: 100000 }]) },
    });
    expect((await applyQuoteToDeal(q1.id)).count).toBe(1);
    // Revised: the deal takes the new products, not added to the old.
    const q2 = await prisma.quotation.create({
      data: { ref: `DQ/${Date.now()}/2`, type: "quote", customerName: "Acme", total: 1, ownerId: rep.id, createdById: rep.id, dealId: deal.id, data: doc([{ kind: "item", productId: b.id, description: b.model, qty: 3, unitPrice: 50000 }]) },
    });
    await applyQuoteToDeal(q2.id);
    const items = await prisma.dealLineItem.findMany({ where: { dealId: deal.id } });
    expect(items.map((i) => [i.productId, i.qty, i.unitPrice])).toEqual([[b.id, 3, 50000]]);
    // No hand edits while a quotation leads.
    const fd = new FormData();
    fd.set("productId", a.id);
    fd.set("qty", "1");
    fd.set("unitPrice", "1");
    await expect(addDealLineItem(deal.id, fd)).rejects.toThrow(/quotation/);
  });
});
