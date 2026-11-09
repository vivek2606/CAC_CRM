import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { failureAnalysis } from "@/lib/failure-analysis";
import { describeDb, makeUser } from "./helpers";

describeDb("failure analysis", () => {
  it("gives failures as a share of units sold, leaving out installation and cancelled complaints", async () => {
    const rep = await makeUser("FA Rep");
    const tag = `FA${Date.now()}`;
    const model = `${tag}-A`;
    const sold = new Date("2019-02-01T00:00:00Z");
    await prisma.installedUnit.create({ data: { customerName: "FA", model, qty: 20, invoiceDate: sold, category: "Split AC" } });
    const base = { customerName: "FA", model, invoiceDate: sold, registeredById: rep.id };
    let n = 0;
    const complaint = (nature: string, registeredAt: string, extra: object = {}) =>
      prisma.serviceComplaint.create({ data: { ...base, ref: `${tag}/${++n}`, nature, registeredAt: new Date(registeredAt), ...extra } });
    const c1 = await complaint("Not cooling", "2019-03-03T00:00:00Z", { inWarranty: true });
    await prisma.serviceComplaintPart.createMany({
      data: [
        { complaintId: c1.id, kind: "SPARE", name: "PCB", qty: 1, unitCost: 100 },
        { complaintId: c1.id, kind: "CONSUMABLE", name: "Gas", qty: 2, unitCost: 10 },
      ],
    });
    await complaint("Water leakage", "2020-08-01T00:00:00Z");
    await complaint("Installation / re-installation", "2019-02-05T00:00:00Z");
    await complaint("Not cooling", "2019-04-01T00:00:00Z", { status: "CANCELLED" });

    const a = await failureAnalysis(new Date("2019-01-01T00:00:00Z"), new Date("2019-12-31T00:00:00Z"));
    const m = a.byModel.find((x) => x.model === model)!;
    expect(m.unitsSold).toBe(20);
    expect(m.failures).toBe(2);
    expect(m.ratePct).toBe(10);
    expect(m.firstYear).toBe(1);
    expect(m.firstYearRatePct).toBe(5);
    expect(m.inWarranty).toBe(1);
    expect(m.parts).toEqual([{ name: "PCB", qty: 1 }]);
    expect(m.partsCost).toBe(100);
    // By quarter of sale: all 20 sold in 2019 Q1, 2 complaints.
    expect(a.quarters).toEqual(["2019 Q1", "2019 Q2", "2019 Q3", "2019 Q4"]);
    const row = a.cohorts.find((c) => c.model === model)!;
    expect(row.cells[0]).toMatchObject({ quarter: "2019 Q1", unitsSold: 20, failures: 2, ratePct: 10 });
    expect(row.cells[1]).toMatchObject({ unitsSold: 0, ratePct: null });
    const pcb = a.byPart.find((p) => p.name === "PCB" && p.models.some((x) => x.model === model))!;
    expect(pcb.inWarrantyQty).toBeGreaterThanOrEqual(1);
  });
});
