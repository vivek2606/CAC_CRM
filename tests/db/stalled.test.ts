import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { stalledWhere } from "@/lib/stalled";
import { describeDb, makeUser } from "./helpers";

describeDb("stalled deals", () => {
  it("goes by the last customer contact, not the last edit", async () => {
    const rep = await makeUser("Stall Rep");
    const old = new Date(Date.now() - 40 * 86400000);
    const mk = (title: string) => prisma.deal.create({ data: { title, stage: "PROPOSAL", value: 1, ownerId: rep.id, createdAt: old } });
    const edited = await mk("edited yesterday, no contact"); // updatedAt is now - still stalled
    const called = await mk("called 3 days ago");
    await prisma.activity.create({ data: { type: "CALL", subject: "x", ownerId: rep.id, dealId: called.id, status: "COMPLETED", completedAt: new Date(Date.now() - 3 * 86400000), createdAt: old } });
    const planned = await mk("follow-up planned");
    await prisma.activity.create({ data: { type: "CALL", subject: "x", ownerId: rep.id, dealId: planned.id, status: "PENDING", dueAt: new Date(Date.now() + 2 * 86400000), createdAt: old } });
    await prisma.deal.create({ data: { title: "new deal", stage: "PROPOSAL", value: 1, ownerId: rep.id } });
    const hits = await prisma.deal.findMany({ where: { ownerId: rep.id, ...stalledWhere() }, select: { id: true } });
    expect(hits.map((h) => h.id)).toEqual([edited.id]);
  });
});
