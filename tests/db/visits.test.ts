import { expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { describeDb, makeUser } from "./helpers";

const state = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/rbac", () => ({ requireUser: async () => ({ id: state.userId, role: "SALES_MANAGER" }), canAccessOwner: (u: { id: string }, o: string) => u.id === o }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

describeDb("visit planner", () => {
  it("plans a visit as a site visit on the day, and checks in with the location", async () => {
    const { planVisit, checkInVisit } = await import("@/app/(app)/my-day/visit-actions");
    const rep = await makeUser("Visit Rep");
    state.userId = rep.id;
    const acc = await prisma.account.create({ data: { name: "Visit Co", ownerId: rep.id } });
    expect((await planVisit({ date: "2026-11-12", time: "09:30", target: "", purpose: "" })).error).toMatch(/customer or deal/);
    expect((await planVisit({ date: "2026-11-12", time: "09:30", target: `account:${acc.id}`, purpose: "site survey" })).error).toBeUndefined();
    const v = await prisma.activity.findFirstOrThrow({ where: { ownerId: rep.id, type: "SITE_VISIT" } });
    expect(v.subject).toBe("Visit: Visit Co - site survey");
    expect(v.dueAt?.toISOString()).toBe("2026-11-12T08:30:00.000Z"); // 09:30 Lagos
    await checkInVisit(v.id, { note: "Met the facility manager", lat: 6.4281, lng: 3.4219, accuracy: 12 });
    const after = await prisma.activity.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.status).toBe("COMPLETED");
    expect(after.description).toContain("Met the facility manager");
    expect(after.description).toContain("6.42810, 3.42190");
  });
});
