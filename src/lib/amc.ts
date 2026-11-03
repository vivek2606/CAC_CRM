import { prisma } from "@/lib/prisma";

// AMC / PPM contracts: status, the visit plan and references.

const DAY = 86400000;
export const RENEWAL_NOTICE_DAYS = 30;

export type AmcStatus = "ACTIVE" | "RENEWAL_DUE" | "EXPIRED" | "CANCELLED" | "NOT_STARTED";
export const AMC_STATUS_LABEL: Record<AmcStatus, string> = {
  ACTIVE: "Active",
  RENEWAL_DUE: "Renewal due",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  NOT_STARTED: "Starts later",
};
export const AMC_STATUS_TONE: Record<AmcStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  RENEWAL_DUE: "bg-amber-100 text-amber-800",
  EXPIRED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-slate-100 text-slate-500",
  NOT_STARTED: "bg-sky-100 text-sky-800",
};

export function amcStatus(c: { startDate: Date; endDate: Date; cancelled: boolean }, now = new Date()): AmcStatus {
  if (c.cancelled) return "CANCELLED";
  if (now.getTime() > c.endDate.getTime() + DAY) return "EXPIRED";
  if (now < c.startDate) return "NOT_STARTED";
  return c.endDate.getTime() - now.getTime() <= RENEWAL_NOTICE_DAYS * DAY ? "RENEWAL_DUE" : "ACTIVE";
}
// Covers a date (a complaint on that day is under the AMC).
export const amcCovers = (c: { startDate: Date; endDate: Date; cancelled: boolean }, at: Date) =>
  !c.cancelled && at >= c.startDate && at.getTime() <= c.endDate.getTime() + DAY;

// Visits spread evenly over the contract: every 12 / visitsPerYear months
// from the start, while before the end.
export function visitPlan(start: Date, end: Date, visitsPerYear: number): Date[] {
  const every = Math.max(1, Math.round(12 / Math.max(1, visitsPerYear)));
  const out: Date[] = [];
  for (let k = 0; k < 60; k++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + k * every, start.getUTCDate()));
    if (d > end) break;
    out.push(d);
  }
  return out;
}

// The day before the same date a year (or N months) on.
export function defaultEnd(start: Date, months = 12): Date {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate() - 1));
}

export async function nextAmcRef(start: Date): Promise<string> {
  const prefix = `AMC/${start.getUTCFullYear()}/`;
  const last = await prisma.amcContract.findFirst({ where: { ref: { startsWith: prefix } }, orderBy: { ref: "desc" }, select: { ref: true } });
  return `${prefix}${String((last ? Number(last.ref.slice(prefix.length)) : 0) + 1).padStart(4, "0")}`;
}

// The AMC covering a unit on a date, if any (by the sale, or a serial no.).
export async function amcFor(opts: { dealId?: string | null; serialNo?: string | null }, at: Date) {
  const or = [
    ...(opts.dealId ? [{ dealId: opts.dealId }] : []),
    ...(opts.serialNo?.trim() ? [{ serialNos: { has: opts.serialNo.trim() } }] : []),
  ];
  if (!or.length) return null;
  const units = await prisma.installedUnit.findMany({
    where: { OR: or, amcId: { not: null } },
    select: { amc: { select: { id: true, ref: true, startDate: true, endDate: true, cancelled: true, comprehensive: true } } },
  });
  return units.map((u) => u.amc!).find((c) => amcCovers(c, at)) ?? null;
}
