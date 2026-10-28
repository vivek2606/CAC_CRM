"use server";

import { revalidatePath } from "next/cache";
import type { ActivityType, LostReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { LOST_REASONS } from "@/lib/constants";
import { updateDealStage } from "../../deals/actions";

const day = 86400000;
export type FollowUpChannel = "CALL" | "WHATSAPP" | "EMAIL" | "MEETING";
const CHANNEL: Record<FollowUpChannel, { type: ActivityType; label: string }> = {
  CALL: { type: "CALL", label: "Call" },
  WHATSAPP: { type: "NOTE", label: "WhatsApp" },
  EMAIL: { type: "EMAIL", label: "Email" },
  MEETING: { type: "MEETING", label: "Meeting" },
};

async function openQuote(quoteId: string) {
  const user = await requireUser();
  const q = await prisma.quotation.findUnique({
    where: { id: quoteId },
    select: { id: true, ref: true, customerName: true, ownerId: true, dealId: true, deal: { select: { stage: true, accountId: true } } },
  });
  if (!q || !canAccessOwner(user, q.ownerId)) throw new Error("Quotation not found.");
  return { user, q };
}

// Followed up: logged as a completed activity on the deal, and the next
// reminder set for N days from now.
export async function followUpQuote(quoteId: string, channel: FollowUpChannel, note: string, nextInDays: number): Promise<{ error?: string }> {
  try {
    const { user, q } = await openQuote(quoteId);
    const c = CHANNEL[channel];
    if (!c) return { error: "Pick how you followed up." };
    const days = Math.min(60, Math.max(1, Math.round(nextInDays) || 7));
    const now = new Date();
    await prisma.activity.create({
      data: {
        type: c.type,
        subject: `${c.label} follow-up on ${q.ref} - ${q.customerName}`.slice(0, 200),
        description: note.trim().slice(0, 2000) || null,
        status: "COMPLETED",
        completedAt: now,
        ownerId: user.id,
        dealId: q.dealId,
        accountId: q.deal?.accountId ?? null,
      },
    });
    await prisma.quotation.update({ where: { id: q.id }, data: { lastFollowUpAt: now, nextFollowUpAt: new Date(now.getTime() + days * day) } });
    revalidate(q.dealId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the follow-up." };
  }
}

// Lost: a quote on an open deal marks the deal Lost (with the reason);
// a quote with no deal is closed as lost on its own.
export async function markQuoteLost(quoteId: string, reason: LostReason, note: string, lostToBrand: string): Promise<{ error?: string }> {
  try {
    const { q } = await openQuote(quoteId);
    if (!LOST_REASONS.includes(reason)) return { error: "Pick the reason." };
    if (q.dealId && q.deal && q.deal.stage !== "WON" && q.deal.stage !== "LOST") {
      const res = await updateDealStage(q.dealId, "LOST", reason, note.trim() || undefined, undefined, undefined, lostToBrand.trim() || undefined);
      if (res.error) return { error: res.error };
    }
    await prisma.quotation.update({ where: { id: q.id }, data: { outcome: "lost", outcomeNote: [reason, note.trim()].filter(Boolean).join(": ").slice(0, 500) } });
    revalidate(q.dealId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not mark it lost." };
  }
}

function revalidate(dealId: string | null) {
  revalidatePath("/");
  revalidatePath("/quotations/follow-ups");
  if (dealId) revalidatePath(`/deals/${dealId}`);
}
