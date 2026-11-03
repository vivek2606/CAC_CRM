// After-sales service complaints: statuses, natures, warranty and the
// service performance figures. Times are kept in UTC and shown in Lagos time.

export const COMPLAINT_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "AWAITING_SPARES", "RESOLVED", "CLOSED", "CANCELLED"] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  AWAITING_SPARES: "Awaiting spares",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};
export const STATUS_TONE: Record<ComplaintStatus, string> = {
  OPEN: "bg-rose-100 text-rose-700",
  ASSIGNED: "bg-amber-100 text-amber-800",
  IN_PROGRESS: "bg-sky-100 text-sky-800",
  AWAITING_SPARES: "bg-violet-100 text-violet-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-slate-200 text-slate-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};
// Still with us (not resolved, closed or cancelled).
export const PENDING_STATUSES: ComplaintStatus[] = ["OPEN", "ASSIGNED", "IN_PROGRESS", "AWAITING_SPARES"];

export const COMPLAINT_NATURES = [
  "Not cooling / low cooling",
  "Water leakage",
  "Gas leakage / refill",
  "Noise / vibration",
  "Not powering on",
  "Error code on display",
  "Remote / controller problem",
  "Compressor problem",
  "PCB / electrical fault",
  "Ice formation",
  "Bad smell",
  "Installation / re-installation",
  "Servicing / PPM",
  "Other",
] as const;

export const STANDARD_WARRANTY_MONTHS = 12;
export function warrantyUntil(invoiceDate: Date, months: number): Date {
  return new Date(Date.UTC(invoiceDate.getUTCFullYear(), invoiceDate.getUTCMonth() + months, invoiceDate.getUTCDate()));
}
// In warranty when the complaint is registered on or before the end date.
export function isInWarranty(invoiceDate: Date | null, months: number, at: Date): boolean {
  return !!invoiceDate && at.getTime() < warrantyUntil(invoiceDate, months).getTime() + 86400000;
}

// Lagos is UTC+1 all year (no daylight saving).
const LAGOS_OFFSET_MS = 3600000;
// "2026-11-03T14:30" typed in Lagos time -> the moment.
export function fromLagosInput(v: string): Date | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - LAGOS_OFFSET_MS);
}
// The moment -> "2026-11-03T14:30" for a datetime-local input, in Lagos time.
export function toLagosInput(d: Date): string {
  return new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 16);
}
export function lagosDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const HOUR = 3600000;
export function hoursBetween(a: Date | null | undefined, b: Date | null | undefined): number | null {
  return a && b ? Math.max(0, (b.getTime() - a.getTime()) / HOUR) : null;
}
export function fmtHours(h: number | null): string {
  if (h == null || !Number.isFinite(h)) return "-";
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} days`;
}

export type MetricComplaint = {
  registeredAt: Date;
  status: string;
  inWarranty: boolean;
  attendedAt: Date | null;
  resolvedAt: Date | null;
  visits: number;
  feedback: number | null;
  serviceCharge: number;
  technician: string | null;
  nature: string;
  model: string | null;
  serialNo: string | null;
  dealId: string | null;
  parts: { qty: number; unitCost: number; unitPrice: number; chargeable: boolean }[];
};

// Resolved within this many hours of registering counts as on time.
export const TAT_HOURS = 48;
// A complaint on the same unit within this many days of the last one is a repeat.
export const REPEAT_DAYS = 30;

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const pct = (n: number, d: number) => (d ? (n / d) * 100 : null);

// Service performance for a set of complaints.
export function serviceMetrics(list: MetricComplaint[], now = new Date()) {
  const resolved = list.filter((c) => c.resolvedAt);
  const responses = list.map((c) => hoursBetween(c.registeredAt, c.attendedAt)).filter((h): h is number => h != null);
  const resolutions = resolved.map((c) => hoursBetween(c.registeredAt, c.resolvedAt)!).filter((h) => h != null);
  const pending = list.filter((c) => (PENDING_STATUSES as string[]).includes(c.status));
  const ages = pending.map((c) => hoursBetween(c.registeredAt, now)!);
  const rated = list.filter((c) => c.feedback != null);
  // Repeats: the same unit (serial no., else model on the same sale) again within REPEAT_DAYS.
  const unitKey = (c: MetricComplaint) => (c.serialNo?.trim() ? `s:${c.serialNo.trim().toUpperCase()}` : c.dealId && c.model ? `d:${c.dealId}:${c.model}` : null);
  const byUnit = new Map<string, Date[]>();
  for (const c of list) {
    const k = unitKey(c);
    if (k) byUnit.set(k, [...(byUnit.get(k) ?? []), c.registeredAt]);
  }
  let repeats = 0;
  for (const dates of byUnit.values()) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    for (let i = 1; i < dates.length; i++) if (dates[i].getTime() - dates[i - 1].getTime() <= REPEAT_DAYS * 86400000) repeats++;
  }
  const partsCost = (c: MetricComplaint, chargeable: boolean) => c.parts.filter((p) => p.chargeable === chargeable).reduce((s, p) => s + p.qty * p.unitCost, 0);
  const partsBilled = (c: MetricComplaint) => c.parts.filter((p) => p.chargeable).reduce((s, p) => s + p.qty * p.unitPrice, 0);
  return {
    total: list.length,
    pending: pending.length,
    resolved: resolved.length,
    inWarranty: list.filter((c) => c.inWarranty).length,
    outWarranty: list.filter((c) => !c.inWarranty).length,
    avgResponseHours: avg(responses),
    avgResolutionHours: avg(resolutions),
    onTimePct: pct(resolutions.filter((h) => h <= TAT_HOURS).length, resolutions.length),
    firstTimeFixPct: pct(resolved.filter((c) => c.visits <= 1).length, resolved.length),
    oldestPendingHours: ages.length ? Math.max(...ages) : null,
    pendingOver48h: ages.filter((h) => h > TAT_HOURS).length,
    repeats,
    avgFeedback: avg(rated.map((c) => c.feedback!)),
    rated: rated.length,
    // Spares we bore under warranty, and what out-of-warranty work billed.
    warrantyPartsCost: list.reduce((s, c) => s + partsCost(c, false), 0),
    chargeablePartsCost: list.reduce((s, c) => s + partsCost(c, true), 0),
    billed: list.reduce((s, c) => s + (c.inWarranty ? 0 : c.serviceCharge) + partsBilled(c), 0),
  };
}

// Complaint counts and resolution, grouped (by technician, nature, model).
export function groupMetrics(list: MetricComplaint[], keyOf: (c: MetricComplaint) => string) {
  const groups = new Map<string, MetricComplaint[]>();
  for (const c of list) groups.set(keyOf(c), [...(groups.get(keyOf(c)) ?? []), c]);
  return [...groups.entries()].map(([key, cs]) => ({ key, ...serviceMetrics(cs) })).sort((a, b) => b.total - a.total);
}
