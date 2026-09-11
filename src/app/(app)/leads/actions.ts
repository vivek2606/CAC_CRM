"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { STAGE_DEFAULT_PROBABILITY } from "@/lib/constants";
import type { EquipmentType, DealStage, EndUseSegment, Lead, PurchaseTimeframe } from "@prisma/client";

const leadSchema = z.object({
  title: z.string().min(1, "Title is required"),
  customerName: z.string().min(1, "Customer name is required"),
  company: z.string().optional(),
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"]),
  winProbability: z.string().optional(),
  source: z.enum(["WEBSITE", "REFERRAL", "COLD_CALL", "CONTRACTOR", "CONSULTANT", "ARCHITECT", "DIRECT", "EVENT"]),
  equipmentType: z.string().optional(),
  endUseSegment: z.string().optional(),
  competitorBrand: z.string().optional(),
  budgetConfirmed: z.string().optional(),
  expectedPurchaseTimeframe: z.string().optional(),
  value: z.coerce.number().min(0).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(1, "Customer phone is required"),
  notes: z.string().optional(),
  accountId: z.string().optional(),
  contactId: z.string().optional(),
  ownerId: z.string().min(1),
  createdAt: z.string().optional(),
});

function toNullable(value: string | undefined) {
  return value && value.trim() !== "" ? value : null;
}

function toEquipmentType(value: string | undefined): EquipmentType | null {
  return value && value.trim() !== "" ? (value as EquipmentType) : null;
}

function toEndUseSegment(value: string | undefined): EndUseSegment | null {
  return value && value.trim() !== "" ? (value as EndUseSegment) : null;
}

function toPurchaseTimeframe(value: string | undefined): PurchaseTimeframe | null {
  return value && value.trim() !== "" ? (value as PurchaseTimeframe) : null;
}

function toTriStateBoolean(value: string | undefined): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function toWinProbability(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

  const ownerId = user.role === "HEAD" ? parsed.ownerId : user.id;

  const lead = await prisma.lead.create({
    data: {
      title: parsed.title,
      customerName: parsed.customerName,
      company: toNullable(parsed.company),
      status: parsed.status,
      winProbability: toWinProbability(parsed.winProbability),
      source: parsed.source,
      equipmentType: toEquipmentType(parsed.equipmentType),
      endUseSegment: toEndUseSegment(parsed.endUseSegment),
      competitorBrand: toNullable(parsed.competitorBrand),
      budgetConfirmed: toTriStateBoolean(parsed.budgetConfirmed),
      expectedPurchaseTimeframe: toPurchaseTimeframe(parsed.expectedPurchaseTimeframe),
      value: parsed.value ?? null,
      email: toNullable(parsed.email),
      phone: parsed.phone,
      notes: toNullable(parsed.notes),
      accountId: toNullable(parsed.accountId),
      contactId: toNullable(parsed.contactId),
      ownerId,
      createdAt: toEntryDate(parsed.createdAt),
    },
  });

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
  const ownerId = user.role === "HEAD" ? parsed.ownerId : existing.ownerId;

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      title: parsed.title,
      customerName: parsed.customerName,
      company: toNullable(parsed.company),
      status: parsed.status,
      winProbability: toWinProbability(parsed.winProbability),
      source: parsed.source,
      equipmentType: toEquipmentType(parsed.equipmentType),
      endUseSegment: toEndUseSegment(parsed.endUseSegment),
      competitorBrand: toNullable(parsed.competitorBrand),
      budgetConfirmed: toTriStateBoolean(parsed.budgetConfirmed),
      expectedPurchaseTimeframe: toPurchaseTimeframe(parsed.expectedPurchaseTimeframe),
      value: parsed.value ?? null,
      email: toNullable(parsed.email),
      phone: parsed.phone,
      notes: toNullable(parsed.notes),
      accountId: toNullable(parsed.accountId),
      contactId: toNullable(parsed.contactId),
      ownerId,
      createdAt: toEntryDate(parsed.createdAt),
    },
  });

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

  await prisma.lead.delete({ where: { id: leadId } });
  revalidatePath("/leads");
  redirect("/leads");
}

// Shared by every conversion path (single, probability-based bulk, and
// manual checkbox-selected bulk) - creates the Deal with everything carried
// over from the Lead, and marks the Lead Converted.
async function createDealFromLead(lead: Lead, stage: DealStage, probability: number) {
  const deal = await prisma.deal.create({
    data: {
      title: lead.title,
      stage,
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
    },
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "CONVERTED", convertedDealId: deal.id },
  });

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

  const deal = await createDealFromLead(lead, "QUALIFICATION", STAGE_DEFAULT_PROBABILITY.QUALIFICATION);

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
    if (!canAccessOwner(user, lead.ownerId) || lead.status === "CONVERTED") {
      skipped++;
      continue;
    }
    await createDealFromLead(lead, "QUALIFICATION", STAGE_DEFAULT_PROBABILITY.QUALIFICATION);
    converted++;
    totalValue += lead.value ?? 0;
  }

  revalidatePath("/leads");
  revalidatePath("/deals");

  return { summary: { converted, skipped, totalValue } };
}
