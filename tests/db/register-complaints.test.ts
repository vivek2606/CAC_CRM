import { expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { describeDb, makeUser } from "./helpers";

// Sign-in and page refresh aren't available in tests.
const state = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/service-access", () => ({ requireService: async () => ({ id: state.userId, role: "HEAD" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

describeDb("registering several faulty units", () => {
  it("makes one complaint per unit, records the serial nos. given, and refuses clashes", async () => {
    const { registerComplaints } = await import("@/app/(app)/service/actions");
    const head = await makeUser("RC Head");
    state.userId = head.id;
    const tag = `RC${Date.now()}`;
    const deal = await prisma.deal.create({ data: { title: tag, stage: "WON", value: 1, ownerId: head.id, invoiceNo: tag } });
    const a = await prisma.installedUnit.create({ data: { customerName: tag, dealId: deal.id, model: `${tag}-A`, qty: 2 } });
    const b = await prisma.installedUnit.create({ data: { customerName: tag, dealId: deal.id, model: `${tag}-B`, qty: 3 } });
    const input = {
      registeredAt: "2026-11-06T10:00", customerName: tag, contactName: "", phone: "", siteAddress: "", accountId: "", dealId: deal.id, invoiceNo: tag,
      invoiceDate: "2026-10-01", billingCompany: "", productId: "", model: "", serialNo: "", unitId: "", warrantyMonths: 12,
      warrantyOverride: "" as const, warrantyNote: "", nature: "Not cooling / low cooling", description: "", priority: "NORMAL", technician: "",
    };

    // 1 x A (serial known) and 2 x B (one serial known).
    const first = await registerComplaints(input, [
      { unitId: a.id, qty: 1, serials: [`${tag}-A1`] },
      { unitId: b.id, qty: 2, serials: [`${tag}-B1`, ""] },
    ]);
    expect(first.error).toBeUndefined();
    expect(first.ids).toHaveLength(3);
    expect((await prisma.installedUnit.findUniqueOrThrow({ where: { id: b.id } })).serialNos).toEqual([`${tag}-B1`]);

    // Same serial typed twice, or more B serials than units: nothing saved.
    expect((await registerComplaints(input, [{ unitId: b.id, qty: 2, serials: [`${tag}-B2`, `${tag}-B2`] }])).error).toMatch(/twice/);
    expect((await registerComplaints(input, [{ unitId: a.id, qty: 3, serials: [] }])).error).toMatch(/Only 2/);
    expect(await prisma.serviceComplaint.count({ where: { dealId: deal.id } })).toBe(3);

    // 10 days later: another A and another B - new serials go in the free places.
    const second = await registerComplaints({ ...input, registeredAt: "2026-11-16T10:00" }, [
      { unitId: a.id, qty: 1, serials: [`${tag}-A2`] },
      { unitId: b.id, qty: 1, serials: [`${tag}-B3`] },
    ]);
    expect(second.ids).toHaveLength(2);
    expect((await prisma.installedUnit.findUniqueOrThrow({ where: { id: a.id } })).serialNos).toEqual([`${tag}-A1`, `${tag}-A2`]);
    // A full: a third A serial is refused.
    expect((await registerComplaints(input, [{ unitId: a.id, qty: 1, serials: [`${tag}-A9`] }])).error).toMatch(/already have serial/);
  });
});
