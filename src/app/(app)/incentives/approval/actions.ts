"use server";

import { revalidatePath } from "next/cache";
import { notifyIncentives } from "@/lib/push-events";
import { requireBackOffice, requireHead } from "@/lib/rbac";
import { getIncentiveSettings } from "@/lib/incentive";
import { computeMonthIncentives } from "@/lib/incentive-month";
import { getIncentiveApproval, saveIncentiveApproval, snapshotOf } from "@/lib/incentive-approval";

function parseMonth(raw: string): Date {
  const m = raw.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error("Bad month.");
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

// Only months from the scheme's start that have finished can be signed off.
async function assertPayableMonth(month: Date) {
  const settings = await getIncentiveSettings();
  const [sy, sm] = settings.startMonth.split("-").map(Number);
  if (month < new Date(Date.UTC(sy, sm - 1, 1))) throw new Error("Incentives aren't payable for this month.");
  const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  if (next > new Date()) throw new Error("This month hasn't finished yet.");
}

const who = (u: { id: string; name?: string | null }) => ({ id: u.id, name: u.name ?? "" });
const done = () => revalidatePath("/incentives");

// Coordinator (or Head): send the month's table for the Head's approval.
export async function submitIncentives(rawMonth: string) {
  const user = await requireBackOffice();
  const month = parseMonth(rawMonth);
  await assertPayableMonth(month);
  const current = await getIncentiveApproval(month);
  if (current?.status === "APPROVED") throw new Error("Already approved.");
  await saveIncentiveApproval(month, { status: "SUBMITTED", submittedAt: new Date().toISOString(), submittedBy: who(user) });
  if (user.role !== "HEAD") await notifyIncentives("submitted", month, who(user).name);
  done();
}

// Head: approve - freezes the figures shown right now for the PDF.
export async function approveIncentives(rawMonth: string) {
  const head = await requireHead();
  const month = parseMonth(rawMonth);
  await assertPayableMonth(month);
  const current = await getIncentiveApproval(month);
  const { settings, rows, support } = await computeMonthIncentives(month);
  await saveIncentiveApproval(month, {
    status: "APPROVED",
    submittedAt: current?.submittedAt ?? new Date().toISOString(),
    submittedBy: current?.submittedBy ?? who(head),
    approvedAt: new Date().toISOString(),
    approvedBy: who(head),
    snapshot: snapshotOf(rows, support, settings),
  });
  if (current?.submittedBy && current.submittedBy.id !== head.id) await notifyIncentives("approved", month, who(head).name, current.submittedBy.id);
  done();
}

// Head: send back for changes (also withdraws an approval).
export async function returnIncentives(rawMonth: string, note: string) {
  const head = await requireHead();
  const month = parseMonth(rawMonth);
  const current = await getIncentiveApproval(month);
  await saveIncentiveApproval(month, {
    status: "RETURNED",
    submittedAt: current?.submittedAt,
    submittedBy: current?.submittedBy,
    returnedAt: new Date().toISOString(),
    returnedBy: who(head),
    note: note.trim().slice(0, 500) || (current?.status === "APPROVED" ? "Approval withdrawn." : "Sent back for changes."),
  });
  if (current?.submittedBy && current.submittedBy.id !== head.id) await notifyIncentives("returned", month, who(head).name, current.submittedBy.id, note.trim());
  done();
}
