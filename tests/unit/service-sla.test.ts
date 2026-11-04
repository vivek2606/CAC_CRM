import { expect, it } from "vitest";
import { DEFAULT_SLA, slaCompliance, slaStages, slaSummary } from "@/lib/service-sla";

const t = (h: number) => new Date(Date.UTC(2026, 10, 3, 8) + h * 3600000);
const base = { registeredAt: t(0), priority: "NORMAL", status: "OPEN", assignedAt: null, attendedAt: null, resolvedAt: null };

it("tracks each stage: on track, at risk at 3/4 of the time, breached after", () => {
  // Normal: assign 8 h, first visit 24 h, resolve 48 h.
  expect(slaStages(base, DEFAULT_SLA, t(1)).map((x) => x.state)).toEqual(["on_track", "on_track", "on_track"]);
  expect(slaSummary(base, DEFAULT_SLA, t(6.5))).toMatchObject({ state: "at_risk", stage: "assign" });
  expect(slaSummary(base, DEFAULT_SLA, t(9))).toMatchObject({ state: "breached", stage: "assign" });
  const assigned = { ...base, status: "ASSIGNED", assignedAt: t(2) };
  expect(slaSummary(assigned, DEFAULT_SLA, t(19))).toMatchObject({ state: "at_risk", stage: "attend" });
  // Urgent: assign within 2 h.
  expect(slaSummary({ ...base, priority: "URGENT" }, DEFAULT_SLA, t(3))).toMatchObject({ state: "breached", stage: "assign" });
});

it("counts met and missed for the compliance figures", () => {
  const ok = { ...base, status: "CLOSED", assignedAt: t(1), attendedAt: t(5), resolvedAt: t(30) };
  const late = { ...base, status: "RESOLVED", assignedAt: t(1), attendedAt: t(30), resolvedAt: t(60) };
  expect(slaSummary(ok, DEFAULT_SLA, t(100)).state).toBe("met");
  const c = slaCompliance([ok, late], DEFAULT_SLA, t(100));
  expect(c.assign.pct).toBe(100);
  expect(c.attend.pct).toBe(50);
  expect(c.resolve.pct).toBe(50);
});
