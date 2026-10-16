import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessOwner, isBackOffice, type SessionUser } from "@/lib/rbac";
import { isIssuedQuoteRef } from "@/lib/document-format";
import type { DocumentInput, SalesDocument } from "@/lib/sales-document";
import { applyQuoteToDeal } from "@/app/(app)/deals/actions";

// Quotations kept from the Quotations builder: each download saves the
// builder's input under the quote's reference, for a sales person and
// (optionally - it can be linked later) the deal it was made for, so it
// can be downloaded again or revised.

export { DRAFT_TYPE, NOT_DRAFT } from "@/lib/quote-draft";

// Quotes the user may see: their own (as sales person or preparer), and
// quotes on deals they can see. Head / Coordinator see all.
export function visibleQuotationsWhere(user: SessionUser): Prisma.QuotationWhereInput {
  if (isBackOffice(user)) return {};
  return { OR: [{ ownerId: user.id }, { createdById: user.id }, { deal: { ownerId: user.id } }] };
}

export function canSeeQuotation(user: SessionUser, q: { ownerId: string; createdById: string; deal: { ownerId: string } | null }): boolean {
  return (
    canAccessOwner(user, q.ownerId) || q.createdById === user.id || (q.deal != null && canAccessOwner(user, q.deal.ownerId))
  );
}

// People a quote can be made for, in the Head / Coordinator's sales person
// picker: the sales and service managers, the Head and the Coordinator.
export async function quoteSalesPeople(): Promise<{ id: string; name: string }[]> {
  return prisma.user.findMany({
    where: { isActive: true, OR: [{ title: "Sales Manager" }, { title: "Service Manager" }, { role: "HEAD" }, { role: "COORDINATOR" }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

// Who a quote is for: a sales person can only make quotes for themself; the
// Head / Coordinator pick one - or, picking no one, it's their own.
export async function resolveQuoteOwner(user: SessionUser, requested: string | null): Promise<{ id: string; name: string } | null> {
  if (isBackOffice(user) && requested) {
    return prisma.user.findUnique({ where: { id: requested }, select: { id: true, name: true } });
  }
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true } });
  return me ?? { id: user.id, name: user.name ?? "" };
}

// Saves (or, for a later download of the same quote, updates) the quote.
// Returns an error message when it can't be saved.
export async function saveQuotation(
  user: SessionUser,
  input: DocumentInput,
  doc: SalesDocument,
  opts: { dealId: string | null; ownerId: string | null },
): Promise<string | null> {
  if (!isIssuedQuoteRef(input.ref)) return null;
  // Only link a deal the user can see.
  let deal: { id: string; ownerId: string } | null = null;
  if (opts.dealId) {
    const d = await prisma.deal.findUnique({ where: { id: opts.dealId }, select: { id: true, ownerId: true } });
    if (d && canAccessOwner(user, d.ownerId)) deal = d;
  }
  const owner = await resolveQuoteOwner(user, opts.ownerId ?? deal?.ownerId ?? null);
  if (!owner) return "Pick the sales person this quotation is for.";
  const existing = await prisma.quotation.findUnique({
    where: { ref: input.ref },
    select: { id: true, ownerId: true, createdById: true, dealId: true, deal: { select: { ownerId: true } } },
  });
  const fields = {
    type: input.type,
    customerName: doc.to[0] ?? "",
    total: doc.total,
    data: input as unknown as Prisma.InputJsonValue,
    ownerId: owner.id,
  };
  let quoteId: string;
  let linked: boolean;
  if (existing) {
    if (!canSeeQuotation(user, existing)) return "This reference number belongs to another quotation - start a new one.";
    const q = await prisma.quotation.update({ where: { id: existing.id }, data: { ...fields, dealId: deal?.id ?? existing.dealId }, select: { id: true, dealId: true } });
    quoteId = q.id;
    linked = q.dealId != null;
  } else {
    const q = await prisma.quotation.create({ data: { ...fields, ref: input.ref, dealId: deal?.id ?? null, createdById: user.id }, select: { id: true } });
    quoteId = q.id;
    linked = deal != null;
  }
  // A deal with no products yet takes the quote's.
  if (linked) await applyQuoteToDeal(quoteId, true);
  return null;
}
