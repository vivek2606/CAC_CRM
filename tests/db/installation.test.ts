import { expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { describeDb, makeUser } from "./helpers";

// Sign-in, page refresh and pushes aren't available in tests.
const state = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/rbac", () => ({ requireUser: async () => ({ id: state.userId, role: "HEAD" }), canAccessOwner: () => true, isBackOffice: () => true }));
vi.mock("@/lib/service-access", () => ({ requireService: async () => ({ id: state.userId, role: "HEAD" }), SERVICE_MANAGER: "Service Manager" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/push", () => ({ sendPush: async () => 0 }));

describeDb("installation hand-over", () => {
  it("hands a won deal over, schedules and commissions it with the serial nos.", async () => {
    const { handOverInstallation, updateInstallation, commissionInstallation } = await import("@/app/(app)/service/installation-actions");
    const { awaitingHandoverWhere } = await import("@/lib/installation");
    const head = await makeUser("Ins Head");
    state.userId = head.id;
    const tag = `IN${Date.now()}`;
    const open = await prisma.deal.create({ data: { title: `${tag} open`, stage: "PROPOSAL", value: 1, ownerId: head.id } });
    expect((await handOverInstallation(open.id, { contactName: "", phone: "080", siteAddress: "Ikeja", preferredDate: "", notes: "" })).error).toMatch(/Won/);

    const deal = await prisma.deal.create({ data: { title: tag, stage: "WON", value: 1, ownerId: head.id, closedAt: new Date(), invoiceNo: tag } });
    await prisma.quotation.create({ data: { ref: `${tag}/Q`, type: "quote", customerName: tag, total: 1, data: { withInstallation: true }, ownerId: head.id, createdById: head.id, dealId: deal.id } });
    expect(await prisma.deal.count({ where: { id: deal.id, ...awaitingHandoverWhere() } })).toBe(1);
    const a = await prisma.installedUnit.create({ data: { customerName: tag, dealId: deal.id, model: `${tag}-A`, qty: 2 } });

    expect((await handOverInstallation(deal.id, { contactName: "", phone: "080", siteAddress: "", preferredDate: "", notes: "" })).error).toMatch(/site address/);
    const h = await handOverInstallation(deal.id, { contactName: "Bola", phone: "080", siteAddress: "12 Allen Ave, Ikeja", preferredDate: "2026-11-20", notes: "Ceiling cassette" });
    expect(h.id).toBeTruthy();
    expect(await prisma.deal.count({ where: { id: deal.id, ...awaitingHandoverWhere() } })).toBe(0);

    expect((await updateInstallation(h.id!, { action: "schedule", scheduledDate: "2026-11-21", team: "" })).error).toMatch(/team/);
    await updateInstallation(h.id!, { action: "schedule", scheduledDate: "2026-11-21", team: "Team A" });
    expect((await prisma.installationJob.findUniqueOrThrow({ where: { id: h.id } })).status).toBe("SCHEDULED");

    // One serial missing: needs a reason. Same serial twice: refused.
    expect((await commissionInstallation(h.id!, { commissionedAt: "2026-11-06", units: [{ unitId: a.id, serials: [`${tag}-1`, ""] }], missingReason: "" })).error).toMatch(/no serial/);
    expect((await commissionInstallation(h.id!, { commissionedAt: "2026-11-06", units: [{ unitId: a.id, serials: [`${tag}-1`, `${tag}-1`] }], missingReason: "" })).error).toMatch(/twice/);
    expect((await commissionInstallation(h.id!, { commissionedAt: "2026-11-06", units: [{ unitId: a.id, serials: [`${tag}-1`, `${tag}-2`] }], missingReason: "" })).error).toBeUndefined();
    const unit = await prisma.installedUnit.findUniqueOrThrow({ where: { id: a.id } });
    expect(unit.serialNos).toEqual([`${tag}-1`, `${tag}-2`]);
    expect(unit.installedAt?.toISOString().slice(0, 10)).toBe("2026-11-06");
    expect(unit.siteAddress).toBe("12 Allen Ave, Ikeja");
    expect((await prisma.installationJob.findUniqueOrThrow({ where: { id: h.id } })).status).toBe("COMMISSIONED");
  });
});
