"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { STAGE_DEFAULT_PROBABILITY } from "@/lib/constants";
import type { EquipmentType, LeadTemperature } from "@prisma/client";

const leadSchema = z.object({
  title: z.string().min(1, "Title is required"),
  company: z.string().optional(),
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"]),
  temperature: z.string().optional(),
  source: z.enum(["WEBSITE", "REFERRAL", "COLD_CALL", "CONTRACTOR", "CONSULTANT", "ARCHITECT", "DIRECT", "EVENT"]),
  equipmentType: z.string().optional(),
  value: z.coerce.number().min(0).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
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

function toTemperature(value: string | undefined): LeadTemperature | null {
  return value && value.trim() !== "" ? (value as LeadTemperature) : null;
}

export async function createLead(formData: FormData) {
  const user = await requireUser();
  const raw = Object.fromEntries(formData.entries());
  const parsed = leadSchema.parse(raw);

  const ownerId = user.role === "HEAD" ? parsed.ownerId : user.id;

  const lead = await prisma.lead.create({
    data: {
      title: parsed.title,
      company: toNullable(parsed.company),
      status: parsed.status,
      temperature: toTemperature(parsed.temperature),
      source: parsed.source,
      equipmentType: toEquipmentType(parsed.equipmentType),
      value: parsed.value ?? null,
      email: toNullable(parsed.email),
      phone: toNullable(parsed.phone),
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
      company: toNullable(parsed.company),
      status: parsed.status,
      temperature: toTemperature(parsed.temperature),
      source: parsed.source,
      equipmentType: toEquipmentType(parsed.equipmentType),
      value: parsed.value ?? null,
      email: toNullable(parsed.email),
      phone: toNullable(parsed.phone),
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
