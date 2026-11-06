"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccessOwner, isBackOffice, requireUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

// Closing checklist: the won order delivered (date + waybill / delivery
// note no.), or that undone.
export async function setDealDelivered(dealId: string, input: { date: string; ref: string } | null): Promise<{ error?: string }> {
  const user = await requireUser();
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { ownerId: true, stage: true } });
  if (!deal || !(canAccessOwner(user, deal.ownerId) || isBackOffice(user))) return { error: "Deal not found." };
  if (deal.stage !== "WON") return { error: "Only a won deal is delivered." };
  if (input) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Enter the delivery date." };
    const at = new Date(`${input.date}T00:00:00Z`);
    if (at.getTime() > Date.now() + 86400000) return { error: "The delivery date can't be in the future." };
    const ref = input.ref.trim().slice(0, 80) || null;
    await prisma.deal.update({ where: { id: dealId }, data: { deliveredAt: at, deliveryRef: ref } });
    await audit("deal", dealId, user.id, "edited", `Delivered ${input.date.split("-").reverse().join("/")}${ref ? ` (${ref})` : ""}.`);
  } else {
    await prisma.deal.update({ where: { id: dealId }, data: { deliveredAt: null, deliveryRef: null } });
    await audit("deal", dealId, user.id, "edited", "Delivery undone.");
  }
  revalidatePath(`/deals/${dealId}`);
  return {};
}
