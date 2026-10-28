import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getQuoteFollowUps } from "@/lib/quote-followups";
import { describeDb, makeUser } from "./helpers";

const day = 86400000;

describeDb("quote follow-ups", () => {
  it("comes due at 7 days, red at 14, and goes once followed up or lost", async () => {
    const rep = await makeUser("Follow Rep");
    const now = new Date();
    const mk = (n: number, ageDays: number, extra = {}) =>
      prisma.quotation.create({
        data: { ref: `FU-${Date.now()}-${n}`, type: "quote", customerName: `C${n}`, total: 100, data: {}, ownerId: rep.id, createdById: rep.id, createdAt: new Date(now.getTime() - ageDays * day), ...extra },
      });
    const fresh = await mk(1, 3);
    const amber = await mk(2, 8);
    const red = await mk(3, 20);
    const followed = await mk(4, 20, { lastFollowUpAt: new Date(now.getTime() - 2 * day), nextFollowUpAt: new Date(now.getTime() + 3 * day) });
    const lost = await mk(5, 20, { outcome: "lost" });
    const draft = await mk(6, 20, { type: "draft" });

    const list = await getQuoteFollowUps([rep.id], { now, prices: false });
    const byId = new Map(list.map((q) => [q.id, q]));
    expect(byId.has(fresh.id)).toBe(false);
    expect(byId.get(amber.id)?.level).toBe("amber");
    expect(byId.get(red.id)?.level).toBe("red");
    expect(byId.has(followed.id)).toBe(false);
    expect(byId.has(lost.id)).toBe(false);
    expect(byId.has(draft.id)).toBe(false);

    // A follow-up date that has come: due again.
    const later = await getQuoteFollowUps([rep.id], { now: new Date(now.getTime() + 4 * day), prices: false });
    expect(later.some((q) => q.id === followed.id)).toBe(true);
  });
});
