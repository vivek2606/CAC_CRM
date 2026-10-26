"use server";

import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { SERVICE_INVOICE_DRAFT_PREFIX, isServiceInvoiceDraft, serviceInvoiceInputSchema } from "@/lib/service-invoice-schema";

// Saves the invoice being prepared as a draft - nothing is checked beyond the
// form's shape, and no number is taken. An invoice already issued keeps its
// number in the draft, so downloading the draft updates it.
export async function saveServiceInvoiceDraft(input: unknown, draftId: string | null): Promise<{ draftId?: string; error?: string }> {
  const user = await requireBackOffice();
  const parsed = serviceInvoiceInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the invoice." };
  const data = parsed.data;
  const total = Math.round(data.rows.reduce((s, r) => s + (r.kind === "item" ? r.qty * r.rate : 0), 0) * 100) / 100;
  const fields = { customerName: data.to.split("\n")[0]?.trim() ?? "", total, data: data as unknown as Prisma.InputJsonValue };
  if (draftId) {
    const existing = await prisma.serviceInvoice.findUnique({ where: { id: draftId }, select: { ref: true } });
    if (existing && isServiceInvoiceDraft(existing.ref)) {
      await prisma.serviceInvoice.update({ where: { id: draftId }, data: fields });
      revalidatePath("/project-billing/invoice");
      return { draftId };
    }
  }
  const created = await prisma.serviceInvoice.create({
    data: { ...fields, ref: `${SERVICE_INVOICE_DRAFT_PREFIX}${crypto.randomUUID()}`, createdById: user.id },
    select: { id: true },
  });
  revalidatePath("/project-billing/invoice");
  return { draftId: created.id };
}

// Throws away a draft (never an issued invoice).
export async function discardServiceInvoiceDraft(id: string): Promise<{ error?: string }> {
  await requireBackOffice();
  const { count } = await prisma.serviceInvoice.deleteMany({ where: { id, ref: { startsWith: SERVICE_INVOICE_DRAFT_PREFIX } } });
  if (!count) return { error: "Draft not found." };
  revalidatePath("/project-billing/invoice");
  return {};
}
