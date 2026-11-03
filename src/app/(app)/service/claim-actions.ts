"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireService } from "@/lib/service-access";
import { isSerialNA } from "@/lib/service";
import { CLAIM_STATUSES, nextClaimRef, type ClaimStatus } from "@/lib/warranty-claims";

type Result = { error?: string; id?: string };
const clean = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const day = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

function done(id?: string, complaintId?: string) {
  revalidatePath("/service/claims");
  if (id) revalidatePath(`/service/claims/${id}`);
  if (complaintId) revalidatePath(`/service/${complaintId}`);
}

// A claim for a complaint's free spares (in the manufacturer's warranty).
export async function createWarrantyClaim(complaintId: string): Promise<Result> {
  const user = await requireService();
  const c = await prisma.serviceComplaint.findUnique({
    where: { id: complaintId },
    include: { parts: { where: { chargeable: false, kind: "SPARE" } }, warrantyClaim: { select: { id: true } } },
  });
  if (!c) return { error: "Complaint not found." };
  if (c.warrantyClaim) return { id: c.warrantyClaim.id };
  if (!c.inWarranty || c.warrantyNote?.startsWith("Covered by AMC")) return { error: "Only spares given free in the manufacturer's warranty can be claimed." };
  if (!c.parts.length) return { error: "No spares were given free on this complaint." };
  if (!c.serialNo || isSerialNA(c.serialNo)) return { error: "Enter the unit's serial no. on the complaint first - the manufacturer needs it for the claim." };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const claim = await prisma.warrantyClaim.create({
        data: {
          ref: await nextClaimRef(),
          complaintId,
          claimAmount: round2(c.parts.reduce((s, p) => s + p.qty * p.unitCost, 0)),
          createdById: user.id,
          lines: { createMany: { data: c.parts.map((p) => ({ name: p.name, qty: p.qty, unitCost: p.unitCost, partId: p.id })) } },
        },
      });
      done(claim.id, complaintId);
      return { id: claim.id };
    } catch (e) {
      if (!(e instanceof Error && /Unique constraint/i.test(e.message)) || attempt === 2) throw e;
    }
  }
  return { error: "Couldn't save - try again." };
}

export type ClaimUpdate = {
  status?: ClaimStatus;
  date?: string; // when it happened (submitted / decided / credited)
  claimNo?: string;
  approvedAmount?: number;
  creditedAmount?: number;
  creditNoteNo?: string;
  reason?: string;
  partsReturned?: boolean;
  notes?: string;
  lines?: { id: string; qty: number; unitCost: number }[];
  removeLine?: string;
};

export async function updateWarrantyClaim(id: string, u: ClaimUpdate): Promise<Result> {
  await requireService();
  const c = await prisma.warrantyClaim.findUnique({ where: { id }, include: { lines: true } });
  if (!c) return { error: "Claim not found." };
  const at = day(u.date) ?? new Date();
  const data: Parameters<typeof prisma.warrantyClaim.update>[0]["data"] = {};
  // Lines can be changed until the claim is sent.
  if ((u.lines || u.removeLine) && c.status !== "DRAFT") return { error: "The claim is sent - its parts can't be changed." };
  if (u.removeLine) await prisma.warrantyClaimLine.deleteMany({ where: { id: u.removeLine, claimId: id } });
  for (const l of u.lines ?? []) {
    if (!(l.qty > 0) || l.unitCost < 0) return { error: "Each part needs a quantity and a cost." };
    await prisma.warrantyClaimLine.updateMany({ where: { id: l.id, claimId: id }, data: { qty: l.qty, unitCost: round2(l.unitCost) } });
  }
  if (u.lines || u.removeLine) {
    const lines = await prisma.warrantyClaimLine.findMany({ where: { claimId: id } });
    data.claimAmount = round2(lines.reduce((s, l) => s + l.qty * l.unitCost, 0));
  }
  if (u.claimNo !== undefined) data.claimNo = clean(u.claimNo, 80) || null;
  if (u.notes !== undefined) data.notes = clean(u.notes, 2000) || null;
  if (u.partsReturned !== undefined) {
    data.partsReturned = u.partsReturned;
    data.partsReturnedAt = u.partsReturned ? at : null;
  }
  if (u.status) {
    if (!CLAIM_STATUSES.includes(u.status)) return { error: "Unknown status." };
    data.status = u.status;
    if (u.status === "SUBMITTED") {
      data.submittedAt = c.submittedAt ?? at;
      data.decidedAt = null;
      data.reason = null;
    }
    if (u.status === "APPROVED" || u.status === "REJECTED") {
      if (!c.submittedAt) data.submittedAt = at;
      data.decidedAt = at;
    }
    if (u.status === "APPROVED") data.approvedAmount = round2(u.approvedAmount ?? c.approvedAmount ?? c.claimAmount);
    if (u.status === "REJECTED") {
      if (!clean(u.reason)) return { error: "Say why the manufacturer rejected it." };
      data.reason = clean(u.reason, 1000);
    }
    if (u.status === "CREDITED") {
      if (!c.decidedAt) data.decidedAt = at;
      if (!c.submittedAt) data.submittedAt = at;
      data.approvedAmount = c.approvedAmount ?? c.claimAmount;
      data.creditedAmount = round2(u.creditedAmount ?? c.approvedAmount ?? c.claimAmount);
      data.creditedAt = at;
      data.creditNoteNo = clean(u.creditNoteNo, 80) || null;
    }
    if (u.status === "DRAFT") Object.assign(data, { submittedAt: null, decidedAt: null, approvedAmount: null, creditedAmount: null, creditedAt: null, creditNoteNo: null, reason: null });
  }
  await prisma.warrantyClaim.update({ where: { id }, data });
  done(id, c.complaintId);
  return {};
}

export async function deleteWarrantyClaim(id: string): Promise<Result> {
  await requireService();
  const c = await prisma.warrantyClaim.findUnique({ where: { id }, select: { status: true, complaintId: true } });
  if (!c) return {};
  if (c.status !== "DRAFT") return { error: "Only a draft claim can be deleted." };
  await prisma.warrantyClaim.delete({ where: { id } });
  done(undefined, c.complaintId);
  return {};
}
