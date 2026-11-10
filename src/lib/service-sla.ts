import { prisma } from "@/lib/prisma";
import { sendPush } from "@/lib/push";
import { PENDING_STATUSES, fmtHours } from "@/lib/service";

// Service levels for complaints: how fast each is to be assigned, attended
// (first visit / remote fix) and resolved - by priority - and closed after
// resolving. Each stage is on track, at risk (3/4 of its time gone), met or
// breached. At risk is pushed to the Service Manager; a breach to the
// Service Manager, the Head and the Sales Coordinator (escalation).

export type SlaSettings = {
  assignHours: { URGENT: number; NORMAL: number };
  attendHours: { URGENT: number; NORMAL: number };
  resolveHours: { URGENT: number; NORMAL: number };
  closeDays: number;
};
export const DEFAULT_SLA: SlaSettings = {
  assignHours: { URGENT: 2, NORMAL: 8 },
  attendHours: { URGENT: 8, NORMAL: 24 },
  resolveHours: { URGENT: 24, NORMAL: 48 },
  closeDays: 3,
};
const KEY = "service-sla";

export async function getSla(): Promise<SlaSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const v = row?.value as Partial<SlaSettings> | undefined;
  return { ...DEFAULT_SLA, ...(v ?? {}) };
}
export async function saveSla(s: SlaSettings) {
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: s }, update: { value: s } });
}

export type SlaStage = "assign" | "attend" | "resolve";
export const STAGE_LABEL: Record<SlaStage, string> = { assign: "Assign a technician", attend: "First visit", resolve: "Resolve" };
export type StageState = "on_track" | "at_risk" | "breached" | "met" | "missed";
export const STATE_LABEL: Record<StageState, string> = { on_track: "On track", at_risk: "At risk", breached: "Breached", met: "Met", missed: "Missed" };
export const STATE_TONE: Record<StageState, string> = {
  on_track: "bg-emerald-100 text-emerald-800",
  at_risk: "bg-amber-100 text-amber-800",
  breached: "bg-rose-600 text-white",
  met: "bg-emerald-100 text-emerald-800",
  missed: "bg-rose-100 text-rose-700",
};

type SlaComplaint = { registeredAt: Date; priority: string; status: string; assignedAt: Date | null; attendedAt: Date | null; resolvedAt: Date | null };
const HOUR = 3600000;
const RISK_SHARE = 0.75;

export function slaStages(c: SlaComplaint, s: SlaSettings, now = new Date()) {
  const p = c.priority === "URGENT" ? "URGENT" : "NORMAL";
  const cancelled = c.status === "CANCELLED";
  const stages: { stage: SlaStage; hours: number; done: Date | null }[] = [
    { stage: "assign", hours: s.assignHours[p], done: c.assignedAt ?? c.attendedAt ?? c.resolvedAt },
    { stage: "attend", hours: s.attendHours[p], done: c.attendedAt ?? c.resolvedAt },
    { stage: "resolve", hours: s.resolveHours[p], done: c.resolvedAt },
  ];
  return stages.map(({ stage, hours, done }) => {
    const due = new Date(c.registeredAt.getTime() + hours * HOUR);
    let state: StageState;
    if (done) state = done <= due ? "met" : "missed";
    else if (cancelled) state = "met";
    else if (now > due) state = "breached";
    else if (now.getTime() - c.registeredAt.getTime() >= hours * HOUR * RISK_SHARE) state = "at_risk";
    else state = "on_track";
    return { stage, hours, due, done, state };
  });
}

// The complaint's SLA at a glance: the first stage breached / at risk, else
// whether it's all been met.
export function slaSummary(c: SlaComplaint, s: SlaSettings, now = new Date()): { state: StageState; stage: SlaStage | null; due: Date | null } {
  const st = slaStages(c, s, now);
  const pick = st.find((x) => x.state === "breached") ?? st.find((x) => x.state === "at_risk");
  if (pick) return { state: pick.state, stage: pick.stage, due: pick.due };
  const missed = st.find((x) => x.state === "missed");
  if (missed) return { state: "missed", stage: missed.stage, due: missed.due };
  const open = st.find((x) => x.state === "on_track");
  return open ? { state: "on_track", stage: open.stage, due: open.due } : { state: "met", stage: null, due: null };
}

// Share of complaints that met each stage's target (of those that reached
// it, or should have by now).
export function slaCompliance(list: SlaComplaint[], s: SlaSettings, now = new Date()) {
  const out = {} as Record<SlaStage, { met: number; total: number; pct: number | null }>;
  for (const stage of ["assign", "attend", "resolve"] as SlaStage[]) {
    let met = 0;
    let total = 0;
    for (const c of list) {
      if (c.status === "CANCELLED") continue;
      const x = slaStages(c, s, now).find((y) => y.stage === stage)!;
      if (x.state === "met") met++;
      if (x.state === "met" || x.state === "missed" || x.state === "breached") total++;
    }
    out[stage] = { met, total, pct: total ? (met / total) * 100 : null };
  }
  return out;
}

// ---- Escalation pushes (new at-risk / breached stages), at most every 10
// minutes, each stage of each complaint pushed once per state.
const RUN_KEY = "sla-escalation-run";
const SENT_KEY = "sla-escalation-sent";
const EVERY_MS = 10 * 60 * 1000;

export async function runSlaEscalations(now = new Date()): Promise<number> {
  try {
    const last = await prisma.appSetting.findUnique({ where: { key: RUN_KEY } });
    const lastAt = typeof last?.value === "string" ? Date.parse(last.value) : 0;
    if (now.getTime() - lastAt < EVERY_MS) return 0;
    await prisma.appSetting.upsert({ where: { key: RUN_KEY }, create: { key: RUN_KEY, value: now.toISOString() }, update: { value: now.toISOString() } });

    const [s, pending, sentRow, people] = await Promise.all([
      getSla(),
      prisma.serviceComplaint.findMany({
        where: { status: { in: PENDING_STATUSES } },
        select: { id: true, ref: true, customerName: true, nature: true, registeredAt: true, priority: true, status: true, assignedAt: true, attendedAt: true, resolvedAt: true },
      }),
      prisma.appSetting.findUnique({ where: { key: SENT_KEY } }),
      prisma.user.findMany({ where: { isActive: true, OR: [{ title: "Service Manager" }, { role: "HEAD" }, { role: "COORDINATOR" }] }, select: { id: true, title: true } }),
    ]);
    const serviceIds = people.filter((p) => p.title === "Service Manager").map((p) => p.id);
    const everyone = people.map((p) => p.id);
    const sent = ((sentRow?.value as Record<string, string[]> | undefined) ?? {}) as Record<string, string[]>;
    const next: Record<string, string[]> = {};
    let pushes = 0;
    for (const c of pending) {
      const done = new Set(sent[c.id] ?? []);
      for (const x of slaStages(c, s, now)) {
        if (x.state !== "at_risk" && x.state !== "breached") continue;
        const tag = `${x.stage}:${x.state}`;
        if (done.has(tag)) continue;
        done.add(tag);
        const breached = x.state === "breached";
        pushes += await sendPush(breached ? everyone : serviceIds.length ? serviceIds : everyone, {
          title: `${breached ? "SLA breached" : "SLA at risk"} - ${c.ref}${c.priority === "URGENT" ? " (URGENT)" : ""}`,
          body: `${STAGE_LABEL[x.stage]} for ${c.customerName} (${c.nature}) was due within ${fmtHours(x.hours)}${breached ? " - now overdue" : ` - due ${x.due.toLocaleString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}`}`,
          url: `/service/${c.id}`,
          tag: `sla-${c.id}-${x.stage}`,
        });
      }
      next[c.id] = [...done];
    }
    // Only pending complaints are kept.
    await prisma.appSetting.upsert({ where: { key: SENT_KEY }, create: { key: SENT_KEY, value: next }, update: { value: next } });
    return pushes;
  } catch (e) {
    console.error("runSlaEscalations", e);
    return 0;
  }
}
