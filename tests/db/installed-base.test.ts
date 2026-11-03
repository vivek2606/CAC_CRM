import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { syncInstalledUnits } from "@/lib/installed-base";
import { amcFor } from "@/lib/amc";
import { describeDb, makeProduct, makeUser } from "./helpers";

describeDb("installed base", () => {
  it("adds sold units once, with their warranty, and finds the AMC covering them", async () => {
    const rep = await makeUser("Base Rep");
    const p = await makeProduct("IB-" + Date.now());
    const deal = await prisma.deal.create({
      data: { title: "IB customer", stage: "WON", value: 1000, ownerId: rep.id, closedAt: new Date("2026-03-10T00:00:00Z"), invoiceNo: "IB-1", warrantyMonths: 24 },
    });
    const key = `ib-${Date.now()}`;
    await prisma.saleLineItem.create({ data: { sourceKey: key, docDate: new Date("2026-03-10T00:00:00Z"), month: new Date("2026-03-01T00:00:00Z"), qty: 3, value: 1000, productId: p.id, ownerId: rep.id, dealId: deal.id } });

    await syncInstalledUnits();
    const u = await prisma.installedUnit.findUniqueOrThrow({ where: { saleKey: key } });
    expect(u.qty).toBe(3);
    expect(u.warrantyUntil?.toISOString().slice(0, 10)).toBe("2028-03-10");
    // Again: nothing doubled.
    await syncInstalledUnits();
    expect(await prisma.installedUnit.count({ where: { saleKey: key } })).toBe(1);

    const amc = await prisma.amcContract.create({
      data: { ref: `AMC/T/${Date.now()}`, customerName: "IB customer", startDate: new Date("2028-03-11T00:00:00Z"), endDate: new Date("2029-03-10T00:00:00Z"), createdById: rep.id },
    });
    await prisma.installedUnit.update({ where: { id: u.id }, data: { amcId: amc.id } });
    expect((await amcFor({ dealId: deal.id }, new Date("2028-06-01T00:00:00Z")))?.id).toBe(amc.id);
    expect(await amcFor({ dealId: deal.id }, new Date("2027-06-01T00:00:00Z"))).toBeNull();
  });
});
