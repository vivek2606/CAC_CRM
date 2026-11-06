import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCoverage, getFunnel, coverageTone } from "@/lib/coverage-funnel";
import { describeDb, makeUser } from "./helpers";

describeDb("coverage and funnel", () => {
  it("works out pipeline coverage against the target still to go", async () => {
    const rep = await makeUser("Cov Rep");
    const now = new Date("2026-11-15T10:00:00Z");
    const m = (i: number) => new Date(Date.UTC(2026, 10 + i, 1));
    for (const i of [0, 1, 2]) await prisma.target.create({ data: { userId: rep.id, month: m(i), targetValue: 1000 } });
    // 500 achieved this month: 2,500 to go.
    await prisma.deal.create({ data: { title: "won", stage: "WON", value: 500, ownerId: rep.id, closedAt: new Date("2026-11-05T00:00:00Z") } });
    // In the window (incl. no date and overdue): 4,000 + 2,000 + 1,500. Beyond it: left out.
    await prisma.deal.create({ data: { title: "a", stage: "NEGOTIATION", value: 4000, ownerId: rep.id, expectedCloseDate: new Date("2026-12-20T00:00:00Z") } });
    await prisma.deal.create({ data: { title: "b", stage: "PROPOSAL", value: 2000, ownerId: rep.id } });
    await prisma.deal.create({ data: { title: "c", stage: "PROPOSAL", value: 1500, ownerId: rep.id, expectedCloseDate: new Date("2026-10-01T00:00:00Z") } });
    await prisma.deal.create({ data: { title: "d", stage: "PROPOSAL", value: 9999, ownerId: rep.id, expectedCloseDate: new Date("2027-02-01T00:00:00Z") } });

    const { rows } = await getCoverage([{ id: rep.id, name: rep.name }], now);
    expect(rows[0]).toMatchObject({ target: 3000, achieved: 500, toGo: 2500, pipeline: 7500, deals: 3, coverage: 3 });
    expect(coverageTone(3)).toBe("good");
    expect(coverageTone(2.5)).toBe("low");
    expect(coverageTone(1)).toBe("bad");
  });

  it("follows the last 90 days' leads to deal, quote and won", async () => {
    const rep = await makeUser("Fun Rep");
    const now = new Date();
    const mk = async (stage: "PROPOSAL" | "WON" | null, quoted: boolean) => {
      const deal = stage ? await prisma.deal.create({ data: { title: "f", stage, value: 100, ownerId: rep.id } }) : null;
      if (deal && quoted) await prisma.quotation.create({ data: { ref: `FQ/${Date.now()}/${Math.random()}`, type: "quote", customerName: "x", total: 1, data: {}, ownerId: rep.id, createdById: rep.id, dealId: deal.id } });
      await prisma.lead.create({ data: { title: "f", ownerId: rep.id, status: deal ? "CONVERTED" : "NEW", convertedDealId: deal?.id } });
    };
    await mk(null, false);
    await mk(null, false);
    await mk("PROPOSAL", false);
    await mk("PROPOSAL", true);
    await mk("WON", false);
    const { rows } = await getFunnel([{ id: rep.id, name: rep.name }], now);
    expect(rows[0]).toMatchObject({ leads: 5, deals: 3, quoted: 2, won: 1, wonValue: 100 });
  });
});
