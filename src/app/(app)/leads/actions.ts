"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireHead, canAccessOwner } from "@/lib/rbac";
import { STAGE_DEFAULT_PROBABILITY } from "@/lib/constants";
import type { EquipmentType, DealStage, EndUseSegment } from "@prisma/client";

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
  value: z.coerce.number().min(0).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(1, "Customer phone is required"),
  notes: z.string().optional(),
  accountId: z.string().optional(),
  contactId: z.string().optional(),
  ownerId: z.string().min(1),
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

function toWinProbability(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
      value: parsed.value ?? null,
      email: toNullable(parsed.email),
      phone: parsed.phone,
      notes: toNullable(parsed.notes),
      accountId: toNullable(parsed.accountId),
      contactId: toNullable(parsed.contactId),
      ownerId,
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
      value: parsed.value ?? null,
      email: toNullable(parsed.email),
      phone: parsed.phone,
      notes: toNullable(parsed.notes),
      accountId: toNullable(parsed.accountId),
      contactId: toNullable(parsed.contactId),
      ownerId,
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

export async function convertLeadToDeal(leadId: string) {
  const user = await requireUser();
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (!canAccessOwner(user, lead.ownerId)) {
    throw new Error("You do not have access to this lead.");
  }
  if (lead.status === "CONVERTED") {
    redirect(`/leads/${leadId}`);
  }

  const deal = await prisma.deal.create({
    data: {
      title: lead.title,
      stage: "QUALIFICATION",
      value: lead.value ?? 0,
      probability: STAGE_DEFAULT_PROBABILITY.QUALIFICATION,
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
    where: { id: leadId },
    data: { status: "CONVERTED", convertedDealId: deal.id },
  });

  revalidatePath("/leads");
  revalidatePath("/deals");
  redirect(`/deals/${deal.id}`);
}

// Per instruction: Hot (90%) -> Negotiation, Warm (60%) -> Proposal,
// Cold (30%) -> Needs Analysis. Only open, not-yet-converted leads with one
// of these win probabilities are touched, so this is safe to run more than
// once - anything already converted, or without one of these probabilities
// (e.g. Lost leads), is left alone.
const STAGE_BY_WIN_PROBABILITY: Record<number, DealStage> = {
  90: "NEGOTIATION",
  60: "PROPOSAL",
  30: "NEEDS_ANALYSIS",
};

export type BulkConvertSummary = {
  converted: number;
  negotiation: number;
  proposal: number;
  needsAnalysis: number;
  totalValue: number;
};

export type BulkConvertState = { error?: string; summary?: BulkConvertSummary };

// useActionState requires this (prevState, formData) signature; neither is needed here.
export async function bulkConvertLeadsByProbability(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: BulkConvertState | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<BulkConvertState> {
  await requireHead();

  const leads = await prisma.lead.findMany({
    where: { status: { not: "CONVERTED" }, winProbability: { in: [90, 60, 30] } },
  });

  let negotiation = 0;
  let proposal = 0;
  let needsAnalysis = 0;
  let totalValue = 0;

  for (const lead of leads) {
    const stage = STAGE_BY_WIN_PROBABILITY[lead.winProbability!];
    if (!stage) continue;

    const deal = await prisma.deal.create({
      data: {
        title: lead.title,
        stage,
        value: lead.value ?? 0,
        probability: STAGE_DEFAULT_PROBABILITY[stage],
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

    if (stage === "NEGOTIATION") negotiation++;
    else if (stage === "PROPOSAL") proposal++;
    else needsAnalysis++;
    totalValue += lead.value ?? 0;
  }

  revalidatePath("/leads");
  revalidatePath("/deals");

  return {
    summary: { converted: negotiation + proposal + needsAnalysis, negotiation, proposal, needsAnalysis, totalValue },
  };
}
