"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { nextQuoteRef } from "@/lib/quote-ref";
import { canSeeQuotation, resolveQuoteOwner } from "@/lib/saved-quotes";

// Issues the next unique quotation reference, with the initials of the
// sales person it's for (the Head / Coordinator pick one; everyone else
// gets their own).
export async function reserveQuoteRef(ownerId: string | null): Promise<{ ref: string } | { error: string }> {
  const user = await requireUser();
  const owner = await resolveQuoteOwner(user, ownerId);
  if (!owner) return { error: "Pick the sales person this quotation is for." };
  return { ref: await nextQuoteRef(owner.name) };
}

async function quoteForLinking(quoteId: string) {
  const user = await requireUser();
  const q = await prisma.quotation.findUnique({
    where: { id: quoteId },
    select: { id: true, ownerId: true, createdById: true, deal: { select: { ownerId: true } } },
  });
  if (!q || !canSeeQuotation(user, q)) throw new Error("Quotation not found.");
  return { user, q };
}

// The sales person's deals, to link a quotation made without one.
export async function dealOptionsForQuote(quoteId: string): Promise<{ id: string; label: string }[]> {
  const { user, q } = await quoteForLinking(quoteId);
  if (!canAccessOwner(user, q.ownerId)) return [];
  const deals = await prisma.deal.findMany({
    where: { ownerId: q.ownerId, sourceTxnNo: null },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, title: true, stage: true, account: { select: { name: true } }, customerName: true },
  });
  return deals.map((d) => ({
    id: d.id,
    label: [d.title, d.account?.name ?? d.customerName, d.stage === "WON" ? "Won" : d.stage === "LOST" ? "Lost" : null].filter(Boolean).join(" · "),
  }));
}

export async function linkQuotationDeal(quoteId: string, dealId: string | null): Promise<{ error?: string }> {
  const { user, q } = await quoteForLinking(quoteId);
  if (dealId) {
    const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { ownerId: true } });
    if (!deal || !canAccessOwner(user, deal.ownerId)) return { error: "Deal not found." };
  }
  await prisma.quotation.update({ where: { id: q.id }, data: { dealId } });
  revalidatePath("/quotations/saved");
  if (dealId) revalidatePath(`/deals/${dealId}`);
  return {};
}
