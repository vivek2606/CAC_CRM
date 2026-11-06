import { describe, expect, it } from "vitest";
import { fromLagosInput, isInWarranty, serviceMetrics, toLagosInput, warrantyUntil, type MetricComplaint } from "@/lib/service";

const d = (s: string) => new Date(s);

describe("warranty", () => {
  it("is 12 months (or the sale's terms) from the invoice date, the last day included", () => {
    const inv = d("2025-11-03T00:00:00Z");
    expect(warrantyUntil(inv, 12).toISOString().slice(0, 10)).toBe("2026-11-03");
    expect(isInWarranty(inv, 12, d("2026-11-03T18:00:00Z"))).toBe(true);
    expect(isInWarranty(inv, 12, d("2026-11-04T09:00:00Z"))).toBe(false);
    expect(isInWarranty(inv, 24, d("2027-06-01T09:00:00Z"))).toBe(true);
    expect(isInWarranty(null, 12, d("2026-01-01T00:00:00Z"))).toBe(false);
  });
  it("reads and shows times in Lagos time (UTC+1)", () => {
    expect(fromLagosInput("2026-11-03T14:30")!.toISOString()).toBe("2026-11-03T13:30:00.000Z");
    expect(toLagosInput(d("2026-11-03T13:30:00Z"))).toBe("2026-11-03T14:30");
  });
});

describe("service performance", () => {
  const base: MetricComplaint = {
    registeredAt: d("2026-11-01T08:00:00Z"),
    status: "RESOLVED",
    inWarranty: true,
    attendedAt: d("2026-11-01T12:00:00Z"),
    resolvedAt: d("2026-11-02T08:00:00Z"),
    visits: 1,
    feedback: 5,
    serviceCharge: 0,
    technician: "Tunde",
    nature: "Water leakage",
    model: "MSAF-12",
    serialNo: "SN1",
    dealId: null,
    parts: [{ qty: 1, unitCost: 10000, unitPrice: 0, chargeable: false }],
  };
  it("works out response, resolution, first-time fix, repeats and billing", () => {
    const m = serviceMetrics(
      [
        base,
        // Same unit 10 days later, two visits, out of warranty, 3 days to fix.
        {
          ...base,
          registeredAt: d("2026-11-11T08:00:00Z"),
          attendedAt: d("2026-11-11T10:00:00Z"),
          resolvedAt: d("2026-11-14T08:00:00Z"),
          visits: 2,
          inWarranty: false,
          serviceCharge: 15000,
          feedback: 3,
          parts: [{ qty: 2, unitCost: 4000, unitPrice: 6000, chargeable: true }],
        },
        // Still open.
        { ...base, status: "OPEN", attendedAt: null, resolvedAt: null, visits: 0, feedback: null, serialNo: "SN2", parts: [] },
      ],
      d("2026-11-15T08:00:00Z"),
    );
    expect(m.total).toBe(3);
    expect(m.pending).toBe(1);
    expect(m.avgResponseHours).toBe(3); // 4 h and 2 h
    expect(m.avgResolutionHours).toBe(48); // 24 h and 72 h
    expect(m.onTimePct).toBe(50);
    expect(m.firstTimeFixPct).toBe(50);
    expect(m.repeats).toBe(1);
    expect(m.avgFeedback).toBe(4);
    expect(m.warrantyPartsCost).toBe(10000);
    expect(m.billed).toBe(15000 + 12000);
    expect(m.pendingOver48h).toBe(1);
  });
  it("counts a repeat without serial nos. only when one unit of the model was sold", () => {
    const noSerial = { ...base, serialNo: null, dealId: "deal1", model: "B-18" };
    const later = { ...noSerial, registeredAt: d("2026-11-11T08:00:00Z") };
    // 3 x B-18 on the invoice: units without serials can't be told apart.
    expect(serviceMetrics([{ ...noSerial, lineUnits: 3 }, { ...noSerial, lineUnits: 3 }, { ...later, lineUnits: 3 }]).repeats).toBe(0);
    // Not available, likewise.
    expect(serviceMetrics([{ ...noSerial, serialNo: "Not available - plate not visible", lineUnits: 2 }, { ...later, lineUnits: 2 }]).repeats).toBe(0);
    // Only one sold: it must be the same unit.
    expect(serviceMetrics([{ ...noSerial, lineUnits: 1 }, { ...later, lineUnits: 1 }]).repeats).toBe(1);
    // Different serials on the same invoice: different units.
    expect(serviceMetrics([{ ...noSerial, serialNo: "B1", lineUnits: 3 }, { ...later, serialNo: "B2", lineUnits: 3 }]).repeats).toBe(0);
  });
});
