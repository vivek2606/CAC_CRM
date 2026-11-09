import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getApprovalLog } from "@/lib/approval-log";
import { describeDb, makeUser, makeProduct } from "./helpers";

describeDb("approval log", () => {
  it("brings quote and deal discounts, reservations and incentives together with reasons and notes", async () => {
    const rep = await makeUser(`AL Rep ${Date.now()}`);
    const head = await prisma.user.create({ data: { name: "AL Head", email: `alh-${Date.now()}@test.local`, passwordHash: "x", role: "HEAD", title: "Head of Sales" } });
    const p = await makeProduct(`AL-${Date.now()}`);
    // Far in the future so other tests' data stays out of the window.
    const at = new Date(Date.UTC(2300 + (Date.now() % 500), 4, 10));
    const from = new Date(at.getTime() - 86400000);
    const to = new Date(at.getTime() + 86400000);
    const deal = await prisma.deal.create({ data: { title: "AL deal", stage: "WON", value: 5_000_000, ownerId: rep.id, discountApprovedAt: at, discountApprovedById: head.id, discountApprovalNote: "Key account" } });
    await prisma.quotation.create({
      data: {
        ref: `AL/${Date.now()}`, type: "quote", customerName: "Acme", total: 1_000_000, data: {}, ownerId: rep.id, createdById: rep.id,
        discountStatus: "rejected", discountRequest: [{ productId: p.id, description: "Unit X", listRate: 100, netRate: 85, discountPct: 15, maxPct: 10 }],
        discountRequestedAt: from, discountDecidedAt: at, discountDecidedById: head.id, discountReason: "Competitor at 85", discountDecisionNote: "Too low",
      },
    });
    await prisma.stockReservation.create({ data: { dealId: deal.id, productId: p.id, qty: 2, status: "APPROVED", reason: "Advance Friday", requestedById: rep.id, decidedById: head.id, decidedAt: at, decisionNote: "OK", expiresAt: to } });

    const log = (await getApprovalLog(from, to)).filter((e) => e.requestedBy.startsWith("AL Rep"));
    const by = (k: string) => log.find((e) => e.kind === k)!;
    expect(by("Quote discount")).toMatchObject({ status: "Rejected", reason: "Competitor at 85", note: "Too low", decidedBy: "AL Head", amount: 1_000_000 });
    expect(by("Quote discount").detail).toBe("Unit X: 15% (max 10%)");
    expect(by("Deal discount")).toMatchObject({ status: "Approved", note: "Key account", decidedBy: "AL Head", amount: 5_000_000 });
    expect(by("Stock reservation")).toMatchObject({ status: "Approved", reason: "Advance Friday", note: "OK" });
    expect(by("Stock reservation").detail).toMatch(/^2 x AL-/);
  });
});
