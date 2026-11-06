import { expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { describeDb, makeUser } from "./helpers";

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

describeDb("lost on price", () => {
  it("needs the brand and their price, and keeps them", async () => {
    const { updateDealStage } = await import("@/app/(app)/deals/actions");
    const rep = await makeUser("Price Rep");
    state.userId = rep.id;
    const deal = await prisma.deal.create({ data: { title: "p", stage: "PROPOSAL", value: 1120000, ownerId: rep.id } });
    expect((await updateDealStage(deal.id, "LOST", "PRICE_TOO_HIGH", undefined, undefined, undefined, "Gree", null)).error).toMatch(/price/);
    expect((await updateDealStage(deal.id, "LOST", "PRICE_TOO_HIGH", undefined, undefined, undefined, undefined, 1000000)).error).toMatch(/brand/);
    expect((await updateDealStage(deal.id, "LOST", "PRICE_TOO_HIGH", undefined, undefined, undefined, "Gree", 1000000)).error).toBeUndefined();
    const d = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
    expect([d.stage, d.lostToBrand, d.lostToPrice]).toEqual(["LOST", "Gree", 1000000]);
  });
});
