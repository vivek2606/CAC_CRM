import { expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { describeDb, makeUser } from "./helpers";

const state = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/rbac", () => ({ requireUser: async () => ({ id: state.userId, role: "SALES_MANAGER" }), canAccessOwner: () => true, isBackOffice: () => false }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

describeDb("closing checklist", () => {
  it("records and undoes delivery on a won deal only", async () => {
    const { setDealDelivered } = await import("@/app/(app)/deals/closing-actions");
    const rep = await makeUser("Close Rep");
    state.userId = rep.id;
    const open = await prisma.deal.create({ data: { title: "o", stage: "NEGOTIATION", value: 1, ownerId: rep.id } });
    expect((await setDealDelivered(open.id, { date: "2026-11-05", ref: "" })).error).toMatch(/won/);
    const won = await prisma.deal.create({ data: { title: "w", stage: "WON", value: 1, ownerId: rep.id, closedAt: new Date() } });
    expect((await setDealDelivered(won.id, { date: "2999-01-01", ref: "" })).error).toMatch(/future/);
    await setDealDelivered(won.id, { date: "2026-11-05", ref: " WB-9 " });
    let d = await prisma.deal.findUniqueOrThrow({ where: { id: won.id } });
    expect([d.deliveredAt?.toISOString().slice(0, 10), d.deliveryRef]).toEqual(["2026-11-05", "WB-9"]);
    await setDealDelivered(won.id, null);
    d = await prisma.deal.findUniqueOrThrow({ where: { id: won.id } });
    expect(d.deliveredAt).toBeNull();
  });
});
