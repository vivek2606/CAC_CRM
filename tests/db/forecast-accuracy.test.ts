import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureForecastSnapshot, getForecastAccuracy } from "@/lib/forecast-accuracy";
import { describeDb, makeUser } from "./helpers";

describeDb("forecast vs actual", () => {
  it("saves the month's weighted forecast once and compares what was won from it", async () => {
    const rep = await makeUser("Fc Rep");
    await prisma.appSetting.deleteMany({ where: { key: "forecast-snapshots" } });
    const oct = new Date("2026-10-01T06:00:00Z");
    const mk = (value: number, probability: number, close: string) =>
      prisma.deal.create({ data: { title: "f", stage: "NEGOTIATION", value, probability, ownerId: rep.id, expectedCloseDate: new Date(close) } });
    const a = await mk(1000, 80, "2026-10-20T00:00:00Z"); // 800
    const b = await mk(1000, 60, "2026-09-15T00:00:00Z"); // overdue: 600
    await mk(5000, 80, "2026-12-01T00:00:00Z"); // later month: not in October's forecast
    await ensureForecastSnapshot(oct);
    // Taken once: changes later in the month don't move it.
    await prisma.deal.update({ where: { id: b.id }, data: { probability: 100 } });
    await ensureForecastSnapshot(new Date("2026-10-15T06:00:00Z"));
    // a won in October; b slips to November.
    await prisma.deal.update({ where: { id: a.id }, data: { stage: "WON", closedAt: new Date("2026-10-25T00:00:00Z") } });
    await prisma.deal.update({ where: { id: b.id }, data: { stage: "WON", closedAt: new Date("2026-11-03T00:00:00Z") } });
    const { months, rows } = await getForecastAccuracy([{ id: rep.id, name: rep.name }], 6, new Date("2026-11-06T00:00:00Z"));
    expect(months).toEqual(["2026-10"]);
    expect(rows[0].cells[0]).toMatchObject({ forecast: 1400, won: 1000, pct: 71, current: false });
    expect(rows[0].avgPct).toBe(71);
  });
});
