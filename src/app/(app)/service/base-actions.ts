"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireService } from "@/lib/service-access";
import { syncInstalledUnits } from "@/lib/installed-base";
import { nextAmcRef, visitPlan } from "@/lib/amc";
import { STANDARD_WARRANTY_MONTHS, warrantyUntil } from "@/lib/service";

type Result = { error?: string };
const clean = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);

// ---- Installed units

export async function refreshInstalledUnits(): Promise<Result & { added?: number }> {
  await requireService();
  const added = await syncInstalledUnits();
  revalidatePath("/service/units");
  return { added };
}

export type UnitInput = { serialNos: string; siteAddress: string; phone: string; installedAt: string; warrantyMonths: number; notes: string };
export async function updateInstalledUnit(id: string, u: UnitInput): Promise<Result> {
  await requireService();
  const unit = await prisma.installedUnit.findUnique({ where: { id }, select: { invoiceDate: true } });
  if (!unit) return { error: "Unit not found." };
  const months = Math.min(120, Math.max(0, Math.round(u.warrantyMonths || STANDARD_WARRANTY_MONTHS)));
  await prisma.installedUnit.update({
    where: { id },
    data: {
      serialNos: [...new Set(u.serialNos.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 200),
      siteAddress: clean(u.siteAddress) || null,
      phone: clean(u.phone, 60) || null,
      installedAt: day(u.installedAt),
      warrantyMonths: months,
      warrantyUntil: unit.invoiceDate ? warrantyUntil(unit.invoiceDate, months) : null,
      notes: clean(u.notes, 1000) || null,
    },
  });
  revalidatePath("/service/units");
  return {};
}

// A unit sold before the CRM's records (or elsewhere), added by hand.
export type NewUnitInput = { customerName: string; accountId: string; model: string; qty: number; invoiceNo: string; invoiceDate: string; serialNos: string; siteAddress: string; phone: string };
export async function addInstalledUnit(u: NewUnitInput): Promise<Result> {
  await requireService();
  const customerName = clean(u.customerName, 200);
  const model = clean(u.model, 200);
  if (!customerName || !model) return { error: "Enter the customer and the model." };
  const invoiceDate = day(u.invoiceDate);
  await prisma.installedUnit.create({
    data: {
      customerName,
      accountId: u.accountId || null,
      model,
      qty: Math.max(1, Math.round(u.qty || 1)),
      invoiceNo: clean(u.invoiceNo, 60) || null,
      invoiceDate,
      serialNos: u.serialNos.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean),
      siteAddress: clean(u.siteAddress) || null,
      phone: clean(u.phone, 60) || null,
      warrantyMonths: STANDARD_WARRANTY_MONTHS,
      warrantyUntil: invoiceDate ? warrantyUntil(invoiceDate, STANDARD_WARRANTY_MONTHS) : null,
    },
  });
  revalidatePath("/service/units");
  return {};
}

// ---- AMC contracts

export type AmcInput = {
  customerName: string;
  accountId: string;
  contactName: string;
  phone: string;
  siteAddress: string;
  startDate: string;
  endDate: string;
  value: number;
  visitsPerYear: number;
  comprehensive: boolean;
  billingCompany: string;
  invoiceNo: string;
  notes: string;
  unitIds: string[];
};

export async function createAmc(input: AmcInput, renewedFromId?: string): Promise<Result & { id?: string }> {
  const user = await requireService();
  const customerName = clean(input.customerName, 200);
  if (!customerName) return { error: "Enter the customer." };
  const start = day(input.startDate);
  const end = day(input.endDate);
  if (!start || !end || end <= start) return { error: "Enter the start and end dates (end after start)." };
  const visitsPerYear = Math.min(12, Math.max(1, Math.round(input.visitsPerYear || 4)));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const c = await prisma.amcContract.create({
        data: {
          ref: await nextAmcRef(start),
          customerName,
          accountId: input.accountId || null,
          contactName: clean(input.contactName, 120) || null,
          phone: clean(input.phone, 60) || null,
          siteAddress: clean(input.siteAddress) || null,
          startDate: start,
          endDate: end,
          value: Math.max(0, Math.round((input.value || 0) * 100) / 100),
          visitsPerYear,
          comprehensive: !!input.comprehensive,
          billingCompany: clean(input.billingCompany, 20) || null,
          invoiceNo: clean(input.invoiceNo, 60) || null,
          notes: clean(input.notes, 1000) || null,
          renewedFromId: renewedFromId ?? null,
          createdById: user.id,
          visits: { createMany: { data: visitPlan(start, end, visitsPerYear).map((d) => ({ dueDate: d })) } },
        },
      });
      if (input.unitIds.length) await prisma.installedUnit.updateMany({ where: { id: { in: input.unitIds } }, data: { amcId: c.id } });
      revalidatePath("/service/amc");
      revalidatePath("/service/units");
      return { id: c.id };
    } catch (e) {
      if (!(e instanceof Error && /Unique constraint/i.test(e.message)) || attempt === 2) throw e;
    }
  }
  return { error: "Couldn't save - try again." };
}

// Renewal: a new contract from the day after this one ends, for a year,
// with the same units (moved to it), terms and - unless changed - value.
export async function renewAmc(id: string, value: number, visitsPerYear: number): Promise<Result & { id?: string }> {
  await requireService();
  const c = await prisma.amcContract.findUnique({ where: { id }, include: { units: { select: { id: true } } } });
  if (!c) return { error: "Contract not found." };
  const start = new Date(c.endDate.getTime() + 86400000);
  const end = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate() - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return createAmc(
    {
      customerName: c.customerName,
      accountId: c.accountId ?? "",
      contactName: c.contactName ?? "",
      phone: c.phone ?? "",
      siteAddress: c.siteAddress ?? "",
      startDate: iso(start),
      endDate: iso(end),
      value: value || c.value,
      visitsPerYear: visitsPerYear || c.visitsPerYear,
      comprehensive: c.comprehensive,
      billingCompany: c.billingCompany ?? "",
      invoiceNo: "",
      notes: c.notes ?? "",
      unitIds: c.units.map((u) => u.id),
    },
    c.id,
  );
}

export async function setAmcUnits(id: string, add: string[], remove: string[]): Promise<Result> {
  await requireService();
  if (add.length) await prisma.installedUnit.updateMany({ where: { id: { in: add } }, data: { amcId: id } });
  if (remove.length) await prisma.installedUnit.updateMany({ where: { id: { in: remove }, amcId: id }, data: { amcId: null } });
  revalidatePath(`/service/amc/${id}`);
  return {};
}

export async function updateAmc(id: string, u: { invoiceNo?: string; cancelled?: boolean; notes?: string }): Promise<Result> {
  await requireService();
  await prisma.amcContract.update({
    where: { id },
    data: {
      ...(u.invoiceNo !== undefined ? { invoiceNo: clean(u.invoiceNo, 60) || null } : {}),
      ...(u.cancelled !== undefined ? { cancelled: u.cancelled } : {}),
      ...(u.notes !== undefined ? { notes: clean(u.notes, 1000) || null } : {}),
    },
  });
  revalidatePath(`/service/amc/${id}`);
  revalidatePath("/service/amc");
  return {};
}

export async function recordAmcVisit(visitId: string, doneOn: string, technician: string, notes: string): Promise<Result> {
  await requireService();
  const v = await prisma.amcVisit.update({
    where: { id: visitId },
    data: { doneAt: doneOn ? day(doneOn) : null, technician: clean(technician, 120) || null, notes: clean(notes, 1000) || null },
  });
  revalidatePath(`/service/amc/${v.contractId}`);
  revalidatePath("/service/amc");
  return {};
}
