import { prisma } from "@/lib/prisma";

// Warranty claims to the manufacturer for spares replaced free in warranty.

export const CLAIM_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CREDITED"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  DRAFT: "Draft - not sent",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CREDITED: "Credited",
};
export const CLAIM_STATUS_TONE: Record<ClaimStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-sky-100 text-sky-800",
  APPROVED: "bg-violet-100 text-violet-800",
  REJECTED: "bg-rose-100 text-rose-700",
  CREDITED: "bg-emerald-100 text-emerald-800",
};

// A complaint whose spares can be claimed: in the manufacturer's warranty
// (not just covered by our AMC) with spares given free.
// (A blank warranty note counts too - NOT alone would leave those out.)
export const notAmcCovered = { OR: [{ warrantyNote: null }, { NOT: { warrantyNote: { startsWith: "Covered by AMC" } } }] };
export const claimableWhere = {
  inWarranty: true,
  ...notAmcCovered,
  parts: { some: { chargeable: false, kind: "SPARE" } },
};

export async function nextClaimRef(at = new Date()): Promise<string> {
  const prefix = `WC/${at.getUTCFullYear()}/`;
  const last = await prisma.warrantyClaim.findFirst({ where: { ref: { startsWith: prefix } }, orderBy: { ref: "desc" }, select: { ref: true } });
  return `${prefix}${String((last ? Number(last.ref.slice(prefix.length)) : 0) + 1).padStart(4, "0")}`;
}

// What's recovered from what was given: spares given free (our cost),
// claimed, approved and credited.
export function claimTotals(claims: { status: string; claimAmount: number; approvedAmount: number | null; creditedAmount: number | null }[]) {
  const sum = (f: (c: (typeof claims)[number]) => number) => Math.round(claims.reduce((s, c) => s + f(c), 0) * 100) / 100;
  return {
    claimed: sum((c) => (c.status === "DRAFT" ? 0 : c.claimAmount)),
    drafts: sum((c) => (c.status === "DRAFT" ? c.claimAmount : 0)),
    pending: sum((c) => (c.status === "SUBMITTED" ? c.claimAmount : 0)),
    approved: sum((c) => (c.status === "APPROVED" || c.status === "CREDITED" ? (c.approvedAmount ?? c.claimAmount) : 0)),
    rejected: sum((c) => (c.status === "REJECTED" ? c.claimAmount : 0)),
    credited: sum((c) => (c.status === "CREDITED" ? (c.creditedAmount ?? c.approvedAmount ?? c.claimAmount) : 0)),
  };
}
