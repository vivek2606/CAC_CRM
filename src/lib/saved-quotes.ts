import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessOwner, isBackOffice, type SessionUser } from "@/lib/rbac";
import { isIssuedQuoteRef } from "@/lib/document-format";
import type { DocumentInput, SalesDocument } from "@/lib/sales-document";

// Quotations kept from the Quotations builder: each download saves the
// builder's input under the quote's reference, linked to the deal it was
// made for, so it can be downloaded again or revised later.

// Quotes the user may see: their own, and quotes on deals they can see.
// Head / Coordinator see all.
export function visibleQuotationsWhere(user: SessionUser): Prisma.QuotationWhereInput {
  if (isBackOffice(user)) return {};
  return { OR: [{ createdById: user.id }, { deal: { ownerId: user.id } }] };
}

export function canSeeQuotation(user: SessionUser, q: { createdById: string; deal: { ownerId: string } | null }): boolean {
  return canAccessOwner(user, q.createdById) || (q.deal != null && canAccessOwner(user, q.deal.ownerId));
}

// Saves (or, for a later download of the same quote, updates) the quote.
// Returns an error message when the reference belongs to a quote this user
// can't see.
export async function saveQuotation(user: SessionUser, input: DocumentInput, doc: SalesDocument, dealId: string | null): Promise<string | null> {
  if (!isIssuedQuoteRef(input.ref)) return null;
  // Only link a deal the user can see.
  let linkDealId: string | null = null;
  if (dealId) {
    const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { ownerId: true } });
    if (deal && canAccessOwner(user, deal.ownerId)) linkDealId = dealId;
  }
  const existing = await prisma.quotation.findUnique({
    where: { ref: input.ref },
    select: { id: true, createdById: true, dealId: true, deal: { select: { ownerId: true } } },
  });
  const fields = {
    type: input.type,
    customerName: doc.to[0] ?? "",
    total: doc.total,
    data: input as unknown as Prisma.InputJsonValue,
  };
  if (existing) {
    if (!canSeeQuotation(user, existing)) return "This reference number belongs to another quotation - start a new one.";
    await prisma.quotation.update({ where: { id: existing.id }, data: { ...fields, dealId: linkDealId ?? existing.dealId } });
  } else {
    await prisma.quotation.create({ data: { ...fields, ref: input.ref, dealId: linkDealId, createdById: user.id } });
  }
  return null;
}
