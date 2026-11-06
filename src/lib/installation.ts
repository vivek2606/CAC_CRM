import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NOT_DRAFT } from "@/lib/quote-draft";
import { serialSlots, syncInstalledUnits } from "@/lib/installed-base";

// Installation jobs (supply + installation orders): see InstallationJob in
// the schema. Supply-only sales - most contractor sales - have none.

export const INSTALL_STATUSES = ["PENDING", "SCHEDULED", "IN_PROGRESS", "COMMISSIONED", "CANCELLED"] as const;
export type InstallStatus = (typeof INSTALL_STATUSES)[number];
export const OPEN_INSTALL_STATUSES: InstallStatus[] = ["PENDING", "SCHEDULED", "IN_PROGRESS"];
export const INSTALL_LABEL: Record<InstallStatus, string> = {
  PENDING: "To schedule",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "Installing",
  COMMISSIONED: "Commissioned",
  CANCELLED: "Cancelled",
};
export const INSTALL_TONE: Record<InstallStatus, { bg: string; text: string }> = {
  PENDING: { bg: "bg-amber-100", text: "text-amber-800" },
  SCHEDULED: { bg: "bg-sky-100", text: "text-sky-800" },
  IN_PROGRESS: { bg: "bg-indigo-100", text: "text-indigo-800" },
  COMMISSIONED: { bg: "bg-emerald-100", text: "text-emerald-800" },
  CANCELLED: { bg: "bg-slate-100", text: "text-slate-600" },
};
export const isInstallStatus = (s: string | undefined): s is InstallStatus => !!s && (INSTALL_STATUSES as readonly string[]).includes(s);

// A won deal is prompted for hand-over when one of its quotations was made
// with installation, for this long after the win.
export const HANDOVER_PROMPT_DAYS = 60;
export const withInstallationQuote = { quotations: { some: { ...NOT_DRAFT, data: { path: ["withInstallation"], equals: true } } } } satisfies Prisma.DealWhereInput;

// Won deals quoted with installation and not handed over yet.
export function awaitingHandoverWhere(now = new Date()): Prisma.DealWhereInput {
  return { stage: "WON", installationJob: null, closedAt: { gte: new Date(now.getTime() - HANDOVER_PROMPT_DAYS * 86400000) }, ...withInstallationQuote };
}

export async function quotedWithInstallation(dealId: string): Promise<boolean> {
  return (await prisma.deal.count({ where: { id: dealId, ...withInstallationQuote } })) > 0;
}

export async function nextInstallRef(at = new Date()): Promise<string> {
  const prefix = `INS/${at.getUTCFullYear()}/`;
  const last = await prisma.installationJob.findFirst({ where: { ref: { startsWith: prefix } }, orderBy: { ref: "desc" }, select: { ref: true } });
  const n = last ? Number(last.ref.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

// The units on an installation's deal (the installed base is brought up to
// date first when it has none yet - it is built from the won deals).
export async function installationUnits(dealId: string) {
  const find = () => prisma.installedUnit.findMany({ where: { dealId }, orderBy: { createdAt: "asc" }, select: { id: true, model: true, qty: true, serialNos: true } });
  let lines = await find();
  if (!lines.length) {
    await syncInstalledUnits();
    lines = await find();
  }
  return lines.map((l) => ({ unitId: l.id, model: l.model, qty: l.qty, serials: serialSlots(l) }));
}
