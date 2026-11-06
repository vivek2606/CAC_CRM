"use server";

import { audit, auditDiff, fmtDate, fmtMoney, userNames } from "@/lib/audit";
import { backOfficeDefaultOwner, dealOwnerProblem } from "@/lib/deal-owner";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { binLead } from "@/lib/recycle-bin";
import { formatNgPhone } from "@/lib/phone";
import { requireUser, canAccessOwner, isBackOffice } from "@/lib/rbac";
import { DEAL_STAGE_LABELS, STAGE_DEFAULT_PROBABILITY, QUICK_ADD_TAG } from "@/lib/constants";
import { parseTagsInput } from "@/lib/tags";
import type { EquipmentType, DealStage, Lead, PurchaseTimeframe } from "@prisma/client";

const leadSchema = z.object({
  title: z.string().min(1, "Title is required"),
  // Required for sales managers (checked in requireContact); optional for
  // the Head and Sales Coordinator entering on someone's behalf.
  customerName: z.string().trim().optional().default(""),
  company: z.string().optional(),
  // Not on the new-lead form: a new lead is New. Winning probability, budget
  // confirmed and end-use segment belong to the deal stage, not the lead form.
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"]).optional(),
  // Required from sales people (checked in requireLeadDetails); the Head and
  // the Sales Coordinator may leave them.
  source: z.enum(["WEBSITE", "REFERRAL", "COLD_CALL", "CONTRACTOR", "CONSULTANT", "ARCHITECT", "DIRECT", "EVENT"]).optional().or(z.literal("")),
  equipmentType: z.string().optional(),
  competitorBrand: z.string().optional(),
  expectedPurchaseTimeframe: z.string().optional(),
  value: z.coerce.number().finite().transform((v) => Math.round(v * 100) / 100).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().trim().optional().default(""),
  notes: z.string().optional(),
  accountId: z.string().optional(),
  contactId: z.string().optional(),
  ownerId: z.string().optional(),
  createdAt: z.string().optional(),
});

// A sales person's lead needs the customer's name and contact no., the
// expected purchase timeframe and the source; the Head and the Sales
// Coordinator may leave any of them.
function requireContact(user: Parameters<typeof isBackOffice>[0], name: string, phone: string, d?: { source?: string; expectedPurchaseTimeframe?: string }) {
  if (isBackOffice(user)) return;
  if (!name) throw new Error("Customer name is required");
  if (!phone) throw new Error("Customer contact no. is required");
  if (d && !d.expectedPurchaseTimeframe) throw new Error("Pick the expected purchase timeframe.");
  if (d && !d.source) throw new Error("Pick the source of the lead.");
}

function toNullable(value: string | undefined) {
  return value && value.trim() !== "" ? value : null;
}

function toEquipmentType(value: string | undefined): EquipmentType | null {
  return value && value.trim() !== "" ? (value as EquipmentType) : null;
}

function toPurchaseTimeframe(value: string | undefined): PurchaseTimeframe | null {
  return value && value.trim() !== "" ? (value as PurchaseTimeframe) : null;
}

// The "Date" field lets a rep backdate a lead they're only now getting
// around to logging - defaults to today in the form, but falls back to
// "now" here too if it's ever missing or unparseable.
function toEntryDate(value: string | undefined): Date {
  if (!value) return new Date();
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function createLead(formData: FormData) {
  const user = await requireUser();
  const raw = Object.fromEntries(formData.entries());
  const parsed = leadSchema.parse(raw);
  requireContact(user, parsed.customerName, parsed.phone, parsed);

  const ownerId = isBackOffice(user) ? parsed.ownerId || (await backOfficeDefaultOwner(user)) : user.id;

  const lead = await prisma.lead.create({
    data: {
      title: parsed.title,
      customerName: toNullable(parsed.customerName),
      company: toNullable(parsed.company),
      status: parsed.status ?? "NEW",
      source: parsed.source || "DIRECT",
      equipmentType: toEquipmentType(parsed.equipmentType),
      competitorBrand: toNullable(parsed.competitorBrand),
      expectedPurchaseTimeframe: toPurchaseTimeframe(parsed.expectedPurchaseTimeframe),
      value: parsed.value ?? null,
      email: toNullable(parsed.email),
      phone: formatNgPhone(parsed.phone),
      notes: toNullable(parsed.notes),
      tags: parseTagsInput(formData.get("tags")),
      accountId: toNullable(parsed.accountId),
      contactId: toNullable(parsed.contactId),
      ownerId,
      createdAt: toEntryDate(parsed.createdAt),
    },
  });
  {
    const owner = (await userNames([ownerId])).get(ownerId);
    await audit("lead", lead.id, user.id, "created", `For ${owner ?? "-"}${parsed.value ? ` - ${fmtMoney(parsed.value)}` : ""}.`);
  }

  revalidatePath("/leads");
  redirect(`/leads/${lead.id}`);
}

export async function updateLead(leadId: string, formData: FormData) {
  const user = await requireUser();
  const existing = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (!canAccessOwner(user, existing.ownerId)) {
    throw new Error("You do not have access to this lead.");
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = leadSchema.parse(raw);
  requireContact(user, parsed.customerName, parsed.phone, parsed);
  const ownerId = isBackOffice(user) ? parsed.ownerId || existing.ownerId : existing.ownerId;

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      title: parsed.title,
      customerName: toNullable(parsed.customerName),
      company: toNullable(parsed.company),
      ...(parsed.status ? { status: parsed.status } : {}),
      source: parsed.source || "DIRECT",
      equipmentType: toEquipmentType(parsed.equipmentType),
      competitorBrand: toNullable(parsed.competitorBrand),
      expectedPurchaseTimeframe: toPurchaseTimeframe(parsed.expectedPurchaseTimeframe),
      value: parsed.value ?? null,
      email: toNullable(parsed.email),
      phone: formatNgPhone(parsed.phone),
      notes: toNullable(parsed.notes),
      tags: parseTagsInput(formData.get("tags")),
      accountId: toNullable(parsed.accountId),
      contactId: toNullable(parsed.contactId),
      ownerId,
      createdAt: toEntryDate(parsed.createdAt),
    },
  });
  // History: what this edit changed.
  {
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    const names = await userNames([existing.ownerId, after.ownerId]);
    const changes = auditDiff(existing as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, [
      { key: "title", label: "Name" },
      { key: "ownerId", label: "Sales person", fmt: (v) => names.get(String(v)) ?? String(v) },
      { key: "status", label: "Status" },
      { key: "customerName", label: "Customer" },
      { key: "company", label: "Company" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "value", label: "Value", fmt: fmtMoney },
      { key: "winProbability", label: "Win probability %" },
      { key: "source", label: "Source" },
      { key: "equipmentType", label: "Equipment" },
      { key: "expectedPurchaseTimeframe", label: "Purchase timeframe" },
      { key: "accountId", label: "Account" },
      { key: "createdAt", label: "Lead date", fmt: fmtDate },
      { key: "notes", label: "Notes" },
    ]);
    if (changes.length) await audit("lead", leadId, user.id, "edited", changes.join("; "));
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  redirect(`/leads/${leadId}`);
}

export async function deleteLead(leadId: string) {
  const user = await requireUser();
  const existing = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (!canAccessOwner(user, existing.ownerId)) {
    throw new Error("You do not have access to this lead.");
  }

  // Into the recycle bin first (restorable for 30 days).
  await binLead(leadId, user.id);
  await audit("lead", leadId, user.id, "deleted", `${existing.title} - moved to the recycle bin.`);
  await prisma.lead.delete({ where: { id: leadId } });
  revalidatePath("/leads");
  redirect("/leads");
}

// Shared by every conversion path (single, probability-based bulk, and
// manual checkbox-selected bulk) - creates the Deal with everything carried
// over from the Lead, and marks the Lead Converted.
async function createDealFromLead(lead: Lead, stage: DealStage, probability: number, byUserId: string) {
  const ownerProblem = await dealOwnerProblem(lead.ownerId);
  if (ownerProblem) throw new Error(`${ownerProblem} (Assign the lead to a sales person first.)`);
  const deal = await prisma.deal.create({
    data: {
      title: lead.title,
      stage,
      stageChangedAt: new Date(),
      value: lead.value ?? 0,
      probability,
      ownerId: lead.ownerId,
      accountId: lead.accountId,
      contactId: lead.contactId,
      equipmentType: lead.equipmentType,
      endUseSegment: lead.endUseSegment,
      competitorBrand: lead.competitorBrand,
      customerName: lead.customerName,
      customerPhone: lead.phone,
      customerEmail: lead.email,
      paymentTerms: "FULL_ADVANCE",
    },
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "CONVERTED", convertedDealId: deal.id },
  });
  await audit("lead", lead.id, byUserId, "converted", `Converted to a deal (${DEAL_STAGE_LABELS[stage]}).`);
  await audit("deal", deal.id, byUserId, "created", `Converted from the lead "${lead.title}".`);

  return deal;
}

export async function convertLeadToDeal(leadId: string) {
  const user = await requireUser();
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (!canAccessOwner(user, lead.ownerId)) {
    throw new Error("You do not have access to this lead.");
  }
  if (lead.status === "CONVERTED") {
    redirect(`/leads/${leadId}`);
  }

  const deal = await createDealFromLead(lead, "QUALIFICATION", STAGE_DEFAULT_PROBABILITY.QUALIFICATION, user.id);

  revalidatePath("/leads");
  revalidatePath("/deals");
  redirect(`/deals/${deal.id}`);
}

export type BulkConvertSelectedSummary = { converted: number; skipped: number; totalValue: number };
export type BulkConvertSelectedState = { error?: string; summary?: BulkConvertSelectedSummary };

// Converts exactly the leads the rep tick-marked on the Leads tab, each
// starting at Qualification - unlike the probability-tiered bulk convert
// below, a hand-picked mixed selection shouldn't assume a Hot/Warm/Cold
// stage. Silently skips any lead the caller can't access or that's already
// converted, rather than failing the whole batch.
export async function bulkConvertSelectedLeads(leadIds: string[]): Promise<BulkConvertSelectedState> {
  const user = await requireUser();
  if (leadIds.length === 0) return { error: "No leads selected." };

  const leads = await prisma.lead.findMany({ where: { id: { in: leadIds } } });

  let converted = 0;
  let skipped = 0;
  let totalValue = 0;

  for (const lead of leads) {
    // Not the caller's, already converted, or not under a sales person.
    if (!canAccessOwner(user, lead.ownerId) || lead.status === "CONVERTED" || (await dealOwnerProblem(lead.ownerId))) {
      skipped++;
      continue;
    }
    await createDealFromLead(lead, "QUALIFICATION", STAGE_DEFAULT_PROBABILITY.QUALIFICATION, user.id);
    converted++;
    totalValue += lead.value ?? 0;
  }

  revalidatePath("/leads");
  revalidatePath("/deals");

  return { summary: { converted, skipped, totalValue } };
}

// Quick add (the + Lead button in the top bar): a lead in three fields -
// who, their phone no., what they need - the rest filled in later (the bell
// reminds, see "Quick add" leads in notifications.ts).
export async function quickAddLead(input: { name: string; phone: string; need: string; ownerId?: string }): Promise<{ id?: string; error?: string }> {
  const user = await requireUser();
  const name = input.name.trim().slice(0, 200);
  const need = input.need.trim().slice(0, 500);
  if (!name) return { error: "Who is it? Enter the customer or company name." };
  if (!need) return { error: "What do they need? (e.g. 4 x 2HP splits for an office)" };
  const { formatNgPhone } = await import("@/lib/phone");
  const phone = formatNgPhone(input.phone);
  if (!phone && !isBackOffice(user)) return { error: "Enter their phone no." };
  let ownerId = user.id;
  if (isBackOffice(user)) {
    ownerId = input.ownerId || (await backOfficeDefaultOwner(user));
    const problem = await dealOwnerProblem(ownerId);
    if (problem) return { error: problem };
  }
  const lead = await prisma.lead.create({
    data: {
      title: `${name} - ${need}`.slice(0, 200),
      customerName: name,
      company: name,
      phone,
      notes: need,
      status: "NEW",
      source: "DIRECT",
      tags: [QUICK_ADD_TAG],
      ownerId,
    },
  });
  await audit("lead", lead.id, user.id, "created", "Quick add - details to be filled in.");
  revalidatePath("/leads");
  return { id: lead.id };
}

// The people a quick-added lead can be for (the Head / Coordinator pick).
export async function quickAddOwners(): Promise<{ id: string; name: string }[]> {
  const user = await requireUser();
  if (!isBackOffice(user)) return [];
  const { dealOwnerOptions } = await import("@/lib/deal-owner");
  return dealOwnerOptions();
}
