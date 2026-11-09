import { expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { describeDb, makeUser } from "./helpers";

const state = vi.hoisted(() => ({ userId: "", pushed: [] as string[][], later: Promise.resolve() as Promise<void> }));
vi.mock("@/lib/rbac", () => ({ requireUser: async () => ({ id: state.userId, role: "SALES_MANAGER", name: "Rep" }), canAccessOwner: () => true, isBackOffice: () => false }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Map([["host", "crm.test"], ["x-forwarded-proto", "https"]]) }));
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => void (state.later = fn()) }));
vi.mock("@/lib/push", () => ({ sendPush: async (ids: string[]) => (state.pushed.push(ids), 1) }));

describeDb("customer feedback", () => {
  it("asks once the order is delivered, takes one answer, and flags a low rating", async () => {
    const { prepareFeedbackRequest } = await import("@/app/(app)/feedback/actions");
    const { submitFeedback } = await import("@/app/share/feedback/actions");
    const rep = await makeUser(`FB Rep ${Date.now()}`);
    state.userId = rep.id;
    const deal = await prisma.deal.create({ data: { title: "FB order", stage: "WON", value: 1, ownerId: rep.id, closedAt: new Date(), customerName: "Acme", customerPhone: "08031234567" } });

    expect((await prepareFeedbackRequest(deal.id)).error).toMatch(/delivered/);
    await prisma.deal.update({ where: { id: deal.id }, data: { deliveredAt: new Date() } });
    const first = await prepareFeedbackRequest(deal.id);
    expect(first.error).toBeUndefined();
    expect(first.url).toMatch(/^https:\/\/crm\.test\/share\/feedback\/.{20,}$/);
    expect(first.message).toContain("delivery of your order");
    // Asking again reuses the same link.
    expect((await prepareFeedbackRequest(deal.id)).url).toBe(first.url);
    expect(await prisma.customerFeedback.count({ where: { dealId: deal.id } })).toBe(1);

    const token = first.url!.split("/").pop()!;
    expect((await submitFeedback(token, 0, "")).error).toMatch(/rating/);
    expect((await submitFeedback(token, 2, " Late delivery ")).error).toBeUndefined();
    const fb = await prisma.customerFeedback.findUniqueOrThrow({ where: { token } });
    expect([fb.rating, fb.comment]).toEqual([2, "Late delivery"]);
    await state.later;
    expect(state.pushed.at(-1)).toContain(rep.id);
    expect((await submitFeedback(token, 5, "")).error).toMatch(/already/);
    expect((await prepareFeedbackRequest(deal.id)).error).toMatch(/already/);
  });

  it("an installed order is asked about once commissioned", async () => {
    const { feedbackKindFor } = await import("@/lib/feedback");
    expect(feedbackKindFor({ deliveredAt: new Date(), installationJob: { status: "SCHEDULED" } })).toBeNull();
    expect(feedbackKindFor({ deliveredAt: new Date(), installationJob: { status: "COMMISSIONED" } })).toBe("INSTALLATION");
    expect(feedbackKindFor({ deliveredAt: new Date(), installationJob: { status: "CANCELLED" } })).toBe("DELIVERY");
    expect(feedbackKindFor({ deliveredAt: null, installationJob: null })).toBeNull();
  });
});
