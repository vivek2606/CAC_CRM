import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { moveBackOfficeDeal } from "@/lib/deal-owner";
import { describeDb, makeUser } from "./helpers";

describeDb("deal owner", () => {
  it("moves a deal made under the Head, with its lead, to the sales person picked on the quote", async () => {
    const head = await prisma.user.create({ data: { name: "Owner Head", email: `oh-${Date.now()}@test.local`, passwordHash: "x", role: "HEAD", title: "Head of Sales" } });
    const rep = await makeUser("Owner Rep");
    const other = await makeUser("Other Rep");
    const deal = await prisma.deal.create({ data: { title: "Q deal", stage: "PROPOSAL", value: 100, ownerId: head.id } });
    const lead = await prisma.lead.create({ data: { title: "Q deal", status: "CONVERTED", ownerId: head.id, convertedDealId: deal.id } });

    expect(await moveBackOfficeDeal(deal.id, rep.id, head.id, "Q/1")).toBe(true);
    expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).ownerId).toBe(rep.id);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).ownerId).toBe(rep.id);
    // Already under a sales person: stays.
    expect(await moveBackOfficeDeal(deal.id, other.id, head.id, "Q/1")).toBe(false);
    expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).ownerId).toBe(rep.id);
  });
});
