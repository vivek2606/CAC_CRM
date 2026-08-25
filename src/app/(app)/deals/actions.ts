"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { STAGE_DEFAULT_PROBABILITY } from "@/lib/constants";
import type { DealStage } from "@prisma/client";

const dealSchema = z.object({
  title: z.string().min(1, "Title is required"),
  stage: z.enum(["QUALIFICATION", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]),
  value: z.coerce.number().min(0),
  probability: z.coerce.number().min(0).max(100).optional(),
  expectedCloseDate: z.string().optional(),
  accountId: z.string().optional(),
  contactId: z.string().optional(),
  ownerId: z.string().min(1),
});

function toNullable(value: string | undefined) {
  return value && value.trim() !== "" ? value : null;
}

export async function createDeal(formData: FormData) {
  const user = await requireUser();
  const raw = Object.fromEntries(formData.entries());
  const parsed = dealSchema.parse(raw);
  const ownerId = user.role === "HEAD" ? parsed.ownerId : user.id;

  const deal = await prisma.deal.create({
    data: {
      title: parsed.title,
      stage: parsed.stage,
      value: parsed.value,
      probability: parsed.probability ?? STAGE_DEFAULT_PROBABILITY[parsed.stage],
      expectedCloseDate: parsed.expectedCloseDate ? new Date(parsed.expectedCloseDate) : null,
      accountId: toNullable(parsed.accountId),
      contactId: toNullable(parsed.contactId),
      ownerId,
    },
  });

  revalidatePath("/deals");
  redirect(`/deals/${deal.id}`);
}

export async function updateDeal(dealId: string, formData: FormData) {
  const user = await requireUser();
  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this deal.");

  const raw = Object.fromEntries(formData.entries());
  const parsed = dealSchema.parse(raw);
  const ownerId = user.role === "HEAD" ? parsed.ownerId : existing.ownerId;

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      title: parsed.title,
      stage: parsed.stage,
      value: parsed.value,
      probability: parsed.probability ?? STAGE_DEFAULT_PROBABILITY[parsed.stage],
      expectedCloseDate: parsed.expectedCloseDate ? new Date(parsed.expectedCloseDate) : null,
      accountId: toNullable(parsed.accountId),
      contactId: toNullable(parsed.contactId),
      ownerId,
      closedAt: parsed.stage === "WON" || parsed.stage === "LOST" ? (existing.closedAt ?? new Date()) : null,
      lostReason: parsed.stage === "LOST" ? existing.lostReason : null,
    },
  });

  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}

export async function deleteDeal(dealId: string) {
  const user = await requireUser();
  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this deal.");

  await prisma.deal.delete({ where: { id: dealId } });
  revalidatePath("/deals");
  redirect("/deals");
}

export async function updateDealStage(dealId: string, stage: DealStage, lostReason?: string) {
  const user = await requireUser();
  const existing = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this deal.");

  const isClosed = stage === "WON" || stage === "LOST";

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      stage,
      probability: STAGE_DEFAULT_PROBABILITY[stage],
      closedAt: isClosed ? new Date() : null,
      lostReason: stage === "LOST" ? (lostReason ?? existing.lostReason ?? "Not specified") : null,
    },
  });

  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
}
