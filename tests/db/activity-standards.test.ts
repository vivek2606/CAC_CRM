import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { weekOf, weeklyCounts, metCount, DEFAULT_STANDARDS } from "@/lib/activity-standards";
import { describeDb, makeUser } from "./helpers";

describeDb("activity standards", () => {
  it("weeks run Monday to Sunday, Lagos time", () => {
    // Sunday 23:30 Lagos (22:30 UTC) is still the week of Monday 2 Nov.
    expect(weekOf(new Date("2026-11-08T22:30:00Z")).monday).toBe("2026-11-02");
    // Monday 00:30 Lagos (Sunday 23:30 UTC) starts the next week.
    expect(weekOf(new Date("2026-11-08T23:30:00Z")).monday).toBe("2026-11-09");
  });

  it("counts done calls and visits, issued quotations and new leads per week", async () => {
    const u = await makeUser(`Std ${Date.now()}`);
    const now = new Date("2026-11-11T10:00:00Z");
    const thisWeek = new Date("2026-11-10T09:00:00Z");
    const lastWeek = new Date("2026-11-04T09:00:00Z");
    await prisma.activity.createMany({
      data: [
        { ownerId: u.id, type: "CALL", subject: "c1", status: "COMPLETED", completedAt: thisWeek },
        { ownerId: u.id, type: "CALL", subject: "c2", status: "COMPLETED", completedAt: lastWeek },
        { ownerId: u.id, type: "CALL", subject: "pending", status: "PENDING", dueAt: thisWeek },
        { ownerId: u.id, type: "SITE_VISIT", subject: "v", status: "COMPLETED", completedAt: thisWeek },
      ],
    });
    await prisma.lead.create({ data: { ownerId: u.id, title: "L", createdAt: thisWeek } });
    const { mondays, byUser } = await weeklyCounts([u.id], 2, now);
    expect(mondays).toEqual(["2026-11-02", "2026-11-09"]);
    expect(byUser[u.id][1]).toEqual({ calls: 1, visits: 1, quotes: 0, leads: 1 });
    expect(byUser[u.id][0].calls).toBe(1);
    expect(metCount({ calls: 25, visits: 5, quotes: 4, leads: 3 }, DEFAULT_STANDARDS)).toBe(3);
  });
});
