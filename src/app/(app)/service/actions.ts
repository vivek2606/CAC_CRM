"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireService } from "@/lib/service-access";
import { applyDealWarranty } from "@/lib/installed-base";
import { amcFor } from "@/lib/amc";
import { COMPLAINT_STATUSES, fromLagosInput, isInWarranty, STANDARD_WARRANTY_MONTHS, warrantyUntil, type ComplaintStatus } from "@/lib/service";

type Result = { error?: string };
const clean = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// The sale a unit came from, by invoice no. (CRM invoice or the Sales
// Register's) - for registering a complaint against it.
export type SaleMatch = {
  dealId: string;
  invoiceNo: string;
  invoiceDate: string; // YYYY-MM-DD
  customer: string;
  accountId: string | null;
  phone: string;
  company: string;
  warrantyMonths: number;
  products: { productId: string; model: string; qty: number }[];
  // An AMC covering the sale's units today.
  amc: { ref: string; until: string; comprehensive: boolean } | null;
};
export async function findSaleByInvoice(q: string): Promise<SaleMatch[]> {
  await requireService();
  const no = q.trim();
  if (!no) return [];
  const deals = await prisma.deal.findMany({
    where: {
      stage: "WON",
      OR: [{ invoiceNo: { equals: no, mode: "insensitive" } }, ...(/^\d+$/.test(no) ? [{ sourceTxnNo: Number(no) }] : [])],
    },
    take: 10,
    orderBy: { closedAt: "desc" },
    select: {
      id: true,
      title: true,
      invoiceNo: true,
      sourceTxnNo: true,
      closedAt: true,
      billingCompany: true,
      customerName: true,
      customerPhone: true,
      warrantyMonths: true,
      accountId: true,
      account: { select: { name: true, phone: true } },
      items: { select: { productId: true, qty: true, product: { select: { model: true } } } },
      lineItems: { select: { productId: true, qty: true, product: { select: { model: true } } } },
    },
  });
  const now = new Date();
  const amcs = await Promise.all(deals.map((d) => amcFor({ dealId: d.id }, now)));
  return deals.map((d, i) => {
    const lines = d.items.length ? d.items : d.lineItems;
    const amc = amcs[i];
    return {
      amc: amc ? { ref: amc.ref, until: amc.endDate.toISOString().slice(0, 10), comprehensive: amc.comprehensive } : null,
      dealId: d.id,
      invoiceNo: d.invoiceNo ?? String(d.sourceTxnNo ?? ""),
      invoiceDate: d.closedAt ? d.closedAt.toISOString().slice(0, 10) : "",
      customer: d.account?.name ?? d.customerName ?? d.title,
      accountId: d.accountId,
      phone: d.customerPhone ?? d.account?.phone ?? "",
      company: d.billingCompany ?? "",
      warrantyMonths: d.warrantyMonths ?? STANDARD_WARRANTY_MONTHS,
      products: lines.filter((l) => l.qty > 0).map((l) => ({ productId: l.productId, model: l.product.model, qty: l.qty })),
    };
  });
}

async function nextRef(at: Date): Promise<string> {
  const prefix = `SC/${at.getUTCFullYear()}/`;
  const last = await prisma.serviceComplaint.findFirst({ where: { ref: { startsWith: prefix } }, orderBy: { ref: "desc" }, select: { ref: true } });
  const n = last ? Number(last.ref.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export type ComplaintInput = {
  registeredAt: string; // datetime-local, Lagos time
  customerName: string;
  contactName: string;
  phone: string;
  siteAddress: string;
  accountId: string;
  dealId: string;
  invoiceNo: string;
  invoiceDate: string; // YYYY-MM-DD
  billingCompany: string;
  productId: string;
  model: string;
  serialNo: string;
  warrantyMonths: number;
  // Set to override the warranty worked out from the invoice date (with a note).
  warrantyOverride: "" | "in" | "out";
  warrantyNote: string;
  nature: string;
  description: string;
  priority: string;
  technician: string;
};

export async function registerComplaint(input: ComplaintInput): Promise<Result & { id?: string }> {
  const user = await requireService();
  const registeredAt = fromLagosInput(input.registeredAt);
  if (!registeredAt) return { error: "Enter the date and time the complaint was registered." };
  const customerName = clean(input.customerName, 200);
  if (!customerName) return { error: "Enter the customer." };
  const nature = clean(input.nature, 120);
  if (!nature) return { error: "Pick the nature of the complaint." };
  const invoiceDate = /^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate) ? new Date(`${input.invoiceDate}T00:00:00Z`) : null;
  const months = Math.min(120, Math.max(0, Math.round(input.warrantyMonths || STANDARD_WARRANTY_MONTHS)));
  if (input.warrantyOverride && !clean(input.warrantyNote)) return { error: "Say why the warranty is overridden (e.g. extended warranty agreed)." };
  // Out of warranty but under an AMC: covered all the same (spares too
  // only when the AMC is comprehensive).
  const amc = await amcFor({ dealId: input.dealId || null, serialNo: input.serialNo }, registeredAt);
  const byWarranty = isInWarranty(invoiceDate, months, registeredAt);
  const inWarranty = input.warrantyOverride ? input.warrantyOverride === "in" : byWarranty || !!amc;
  const amcNote = !input.warrantyOverride && !byWarranty && amc ? `Covered by AMC ${amc.ref}${amc.comprehensive ? " (comprehensive)" : " (labour only - spares charged)"}` : "";
  const technician = clean(input.technician, 120);
  const deal = input.dealId ? await prisma.deal.findUnique({ where: { id: input.dealId }, select: { id: true } }) : null;
  const account = input.accountId ? await prisma.account.findUnique({ where: { id: input.accountId }, select: { id: true } }) : null;
  const product = input.productId ? await prisma.product.findUnique({ where: { id: input.productId }, select: { id: true, model: true } }) : null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const c = await prisma.serviceComplaint.create({
        data: {
          ref: await nextRef(registeredAt),
          registeredAt,
          status: technician ? "ASSIGNED" : "OPEN",
          customerName,
          contactName: clean(input.contactName, 120) || null,
          phone: clean(input.phone, 60) || null,
          siteAddress: clean(input.siteAddress) || null,
          accountId: account?.id ?? null,
          dealId: deal?.id ?? null,
          invoiceNo: clean(input.invoiceNo, 60) || null,
          invoiceDate,
          billingCompany: clean(input.billingCompany, 20) || null,
          productId: product?.id ?? null,
          model: product?.model ?? (clean(input.model, 200) || null),
          serialNo: clean(input.serialNo, 100) || null,
          warrantyMonths: months,
          warrantyUntil: invoiceDate ? warrantyUntil(invoiceDate, months) : null,
          inWarranty,
          warrantyNote: clean(input.warrantyNote) || amcNote || null,
          nature,
          description: clean(input.description, 2000) || null,
          priority: input.priority === "URGENT" ? "URGENT" : "NORMAL",
          technician: technician || null,
          assignedAt: technician ? new Date() : null,
          registeredById: user.id,
        },
      });
      revalidatePath("/service");
      return { id: c.id };
    } catch (e) {
      if (!(e instanceof Error && /Unique constraint/i.test(e.message)) || attempt === 2) throw e;
    }
  }
  return { error: "Couldn't save - try again." };
}

// Moving a complaint along: assigning, a visit, resolving, closing, with
// the times each step happened (Lagos time; blank = now).
export type ComplaintUpdate = {
  status?: ComplaintStatus;
  technician?: string;
  at?: string; // datetime-local
  rootCause?: string;
  resolution?: string;
  feedback?: number | null;
  serviceCharge?: number;
  chargeInvoiceNo?: string;
  warrantyOverride?: "in" | "out";
  warrantyNote?: string;
  addVisit?: boolean;
};
export async function updateComplaint(id: string, u: ComplaintUpdate): Promise<Result> {
  await requireService();
  const c = await prisma.serviceComplaint.findUnique({ where: { id } });
  if (!c) return { error: "Complaint not found." };
  const at = (u.at && fromLagosInput(u.at)) || new Date();
  if (at < c.registeredAt) return { error: "That's before the complaint was registered." };
  const data: Parameters<typeof prisma.serviceComplaint.update>[0]["data"] = {};
  if (u.technician !== undefined) {
    data.technician = clean(u.technician, 120) || null;
    if (data.technician && !c.assignedAt) data.assignedAt = at;
    if (data.technician && c.status === "OPEN" && !u.status) data.status = "ASSIGNED";
  }
  if (u.addVisit) {
    data.visits = c.visits + 1;
    if (!c.attendedAt) data.attendedAt = at;
    if (!u.status && (c.status === "OPEN" || c.status === "ASSIGNED")) data.status = "IN_PROGRESS";
  }
  if (u.status) {
    if (!COMPLAINT_STATUSES.includes(u.status)) return { error: "Unknown status." };
    data.status = u.status;
    if ((u.status === "RESOLVED" || u.status === "CLOSED") && !c.resolvedAt) {
      if (!clean(u.resolution) && !c.resolution) return { error: "Say what was done to resolve it." };
      data.resolvedAt = at;
      if (!c.attendedAt) data.attendedAt = at;
      if (c.visits === 0 && !u.addVisit) data.visits = 1;
    }
    if (u.status === "CLOSED") data.closedAt = at;
    // Reopened: not resolved any more.
    if (["OPEN", "ASSIGNED", "IN_PROGRESS", "AWAITING_SPARES"].includes(u.status)) {
      data.resolvedAt = null;
      data.closedAt = null;
    }
  }
  if (u.rootCause !== undefined) data.rootCause = clean(u.rootCause, 1000) || null;
  if (u.resolution !== undefined) data.resolution = clean(u.resolution, 2000) || null;
  if (u.feedback !== undefined) data.feedback = u.feedback == null ? null : Math.min(5, Math.max(1, Math.round(u.feedback)));
  if (u.serviceCharge !== undefined) data.serviceCharge = Math.max(0, Math.round((u.serviceCharge || 0) * 100) / 100);
  if (u.chargeInvoiceNo !== undefined) data.chargeInvoiceNo = clean(u.chargeInvoiceNo, 60) || null;
  if (u.warrantyOverride) {
    if (!clean(u.warrantyNote)) return { error: "Say why the warranty is changed." };
    data.inWarranty = u.warrantyOverride === "in";
    data.warrantyNote = clean(u.warrantyNote);
  }
  await prisma.serviceComplaint.update({ where: { id }, data });
  // Spares already used follow the warranty: free in it, charged out of it.
  if (u.warrantyOverride && data.inWarranty !== c.inWarranty) {
    await prisma.serviceComplaintPart.updateMany({ where: { complaintId: id }, data: { chargeable: !data.inWarranty } });
  }
  revalidatePath("/service");
  revalidatePath(`/service/${id}`);
  return {};
}

export type PartInput = { kind: "SPARE" | "CONSUMABLE"; name: string; qty: number; unit: string; unitCost: number; unitPrice: number; chargeable: boolean };
export async function addComplaintPart(complaintId: string, p: PartInput): Promise<Result> {
  await requireService();
  const name = clean(p.name, 200);
  if (!name) return { error: "Enter the spare or consumable." };
  if (!(p.qty > 0)) return { error: "Enter the quantity." };
  const c = await prisma.serviceComplaint.findUnique({ where: { id: complaintId }, select: { id: true } });
  if (!c) return { error: "Complaint not found." };
  await prisma.serviceComplaintPart.create({
    data: {
      complaintId,
      kind: p.kind === "CONSUMABLE" ? "CONSUMABLE" : "SPARE",
      name,
      qty: p.qty,
      unit: clean(p.unit, 20) || "No.",
      unitCost: Math.max(0, p.unitCost || 0),
      unitPrice: p.chargeable ? Math.max(0, p.unitPrice || 0) : 0,
      chargeable: p.chargeable,
    },
  });
  revalidatePath(`/service/${complaintId}`);
  return {};
}

export async function removeComplaintPart(partId: string): Promise<Result> {
  await requireService();
  const p = await prisma.serviceComplaintPart.delete({ where: { id: partId } }).catch(() => null);
  if (p) revalidatePath(`/service/${p.complaintId}`);
  return {};
}

// A sale's warranty when it isn't the standard 12 months (exceptional
// terms) - complaints on it are judged by this.
export async function setDealWarranty(dealId: string, months: number | null): Promise<Result> {
  await requireService();
  const m = months == null ? null : Math.round(months);
  if (m != null && (m < 0 || m > 120)) return { error: "Enter the warranty in months (0-120)." };
  await prisma.deal.update({ where: { id: dealId }, data: { warrantyMonths: m === STANDARD_WARRANTY_MONTHS ? null : m } });
  await applyDealWarranty(dealId, m ?? STANDARD_WARRANTY_MONTHS);
  revalidatePath(`/deals/${dealId}`);
  return {};
}
