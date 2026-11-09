import { prisma } from "@/lib/prisma";
import type { IncentiveApproval } from "@/lib/incentive-approval";
import type { ExcessLine } from "@/lib/quote-discount";

// The approval log: every discount (quotations and deals), stock reservation
// and monthly incentive the Head decided - or that's waiting - with who
// asked, what for, why, and the Head's note.

export type ApprovalKind = "Quote discount" | "Deal discount" | "Stock reservation" | "Incentives";
export type ApprovalStatus = "Approved" | "Rejected" | "Waiting" | "Sent back";
export type ApprovalEntry = {
  id: string;
  date: Date; // decided, or asked if still waiting
  askedAt: Date | null;
  kind: ApprovalKind;
  status: ApprovalStatus;
  subject: string;
  href: string;
  requestedBy: string;
  detail: string;
  amount: number | null;
  reason: string;
  decidedBy: string;
  note: string;
};
export const APPROVAL_KINDS: ApprovalKind[] = ["Quote discount", "Deal discount", "Stock reservation", "Incentives"];
export const APPROVAL_STATUSES: ApprovalStatus[] = ["Approved", "Rejected", "Sent back", "Waiting"];

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

export async function getApprovalLog(from: Date, to: Date): Promise<ApprovalEntry[]> {
  const inRange = { gte: from, lt: to };
  const [quotes, deals, reservations, incentiveRows] = await Promise.all([
    prisma.quotation.findMany({
      where: { discountStatus: { in: ["approved", "rejected", "pending"] }, OR: [{ discountDecidedAt: inRange }, { discountStatus: "pending" }] },
      select: {
        id: true, ref: true, customerName: true, total: true, discountStatus: true, discountRequest: true, discountRequestedAt: true, discountDecidedAt: true, discountDecidedById: true,
        discountReason: true, discountDecisionNote: true, owner: { select: { name: true } }, createdBy: { select: { name: true } },
      },
    }),
    prisma.deal.findMany({
      where: { discountApprovedAt: inRange },
      select: { id: true, title: true, value: true, discountApprovedAt: true, discountApprovalNote: true, owner: { select: { name: true } }, discountApprovedBy: { select: { name: true } } },
    }),
    prisma.stockReservation.findMany({
      where: { OR: [{ decidedAt: inRange }, { status: "REQUESTED" }] },
      select: {
        id: true, qty: true, status: true, reason: true, requestedAt: true, decidedAt: true, decisionNote: true, dealId: true,
        product: { select: { model: true, code: true } }, deal: { select: { title: true } }, requestedBy: { select: { name: true } }, decidedBy: { select: { name: true } },
      },
    }),
    prisma.appSetting.findMany({ where: { key: { startsWith: "incentive-approval:" } } }),
  ]);
  const deciders = new Map((await prisma.user.findMany({ where: { id: { in: quotes.map((q) => q.discountDecidedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  const out: ApprovalEntry[] = [];
  for (const q of quotes) {
    const lines = Array.isArray(q.discountRequest) ? (q.discountRequest as unknown as ExcessLine[]) : [];
    const waiting = q.discountStatus === "pending";
    out.push({
      id: `q-${q.id}`,
      date: (waiting ? q.discountRequestedAt : q.discountDecidedAt) ?? q.discountRequestedAt ?? new Date(0),
      askedAt: q.discountRequestedAt,
      kind: "Quote discount",
      status: waiting ? "Waiting" : q.discountStatus === "approved" ? "Approved" : "Rejected",
      subject: `${q.ref} - ${q.customerName}`,
      href: waiting ? "/quotations/approvals" : `/quotations?quote=${q.id}`,
      requestedBy: q.createdBy.name !== q.owner.name ? `${q.owner.name} (by ${q.createdBy.name})` : q.owner.name,
      detail: lines.map((l) => `${l.description}: ${pct(l.discountPct)} (max ${pct(l.maxPct)})`).join("; "),
      amount: q.total,
      reason: q.discountReason ?? "",
      decidedBy: waiting ? "" : (deciders.get(q.discountDecidedById ?? "") ?? ""),
      note: q.discountDecisionNote ?? "",
    });
  }
  for (const d of deals) {
    out.push({
      id: `d-${d.id}`,
      date: d.discountApprovedAt!,
      askedAt: null,
      kind: "Deal discount",
      status: "Approved",
      subject: d.title,
      href: `/deals/${d.id}`,
      requestedBy: d.owner.name,
      detail: "Deal priced below list",
      amount: d.value,
      reason: "",
      decidedBy: d.discountApprovedBy?.name ?? "",
      note: d.discountApprovalNote ?? "",
    });
  }
  for (const r of reservations) {
    const waiting = r.status === "REQUESTED";
    out.push({
      id: `r-${r.id}`,
      date: (waiting ? r.requestedAt : r.decidedAt) ?? r.requestedAt,
      askedAt: r.requestedAt,
      kind: "Stock reservation",
      status: waiting ? "Waiting" : r.status === "REJECTED" ? "Rejected" : "Approved",
      subject: r.deal.title,
      href: `/deals/${r.dealId}`,
      requestedBy: r.requestedBy.name,
      detail: `${r.qty} x ${r.product.model} (${r.product.code})${!waiting && r.status !== "APPROVED" && r.status !== "REJECTED" ? ` - since ${r.status.toLowerCase()}` : ""}`,
      amount: null,
      reason: r.reason ?? "",
      decidedBy: r.decidedBy?.name ?? "",
      note: r.decisionNote ?? "",
    });
  }
  for (const row of incentiveRows) {
    const a = row.value as IncentiveApproval;
    const month = row.key.split(":")[1];
    const at = a.approvedAt ?? a.returnedAt ?? a.submittedAt;
    const date = at ? new Date(at) : null;
    if (!date) continue;
    const waiting = a.status === "SUBMITTED";
    if (!waiting && (date < from || date >= to)) continue;
    const total = a.snapshot ? a.snapshot.rows.reduce((s, x) => s + x.totalToReceive, 0) + a.snapshot.support.reduce((s, x) => s + x.amount, 0) : null;
    out.push({
      id: `i-${row.key}`,
      date,
      askedAt: a.submittedAt ? new Date(a.submittedAt) : null,
      kind: "Incentives",
      status: a.status === "APPROVED" ? "Approved" : a.status === "RETURNED" ? "Sent back" : "Waiting",
      subject: new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
      href: `/incentives?month=${month}`,
      requestedBy: a.submittedBy?.name ?? "",
      detail: a.snapshot ? `${a.snapshot.rows.filter((x) => x.totalToReceive > 0).length + a.snapshot.support.filter((x) => x.amount > 0).length} people paid` : "Monthly incentive statement",
      amount: total,
      reason: "",
      decidedBy: a.approvedBy?.name ?? a.returnedBy?.name ?? "",
      note: a.note ?? "",
    });
  }
  return out.sort((a, b) => (a.status === "Waiting" ? -1 : 0) - (b.status === "Waiting" ? -1 : 0) || b.date.getTime() - a.date.getTime());
}
