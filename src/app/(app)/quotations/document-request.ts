import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, isBackOffice } from "@/lib/rbac";
import { buildDocument, documentInputSchema, type SalesDocument } from "@/lib/sales-document";
import { saveQuotation, DRAFT_TYPE } from "@/lib/saved-quotes";
import { isIssuedQuoteRef } from "@/lib/document-format";
import { coveredByApproval, excessDiscounts } from "@/lib/quote-discount";
import { notifyQuoteDiscountDecided, notifyQuoteDiscountRequested } from "@/lib/push-events";

// Shared by the PDF and Excel routes: read the builder's JSON body and turn
// it into the rendered document (totals worked out here, not trusted from
// the browser). The quote is saved under its reference on every download,
// for the sales person (ownerId) and deal (dealId) given in the body.
// Only the Head can generate a document discounted beyond an item's
// permissible maximum. Anyone else's is saved and sent to the Head, who
// prepares it or approves it as it is (then the saved quote downloads, from
// Saved quotations, exactly as approved).
export async function documentFromRequest(request: Request): Promise<{ doc: SalesDocument } | { error: Response }> {
  const user = await requireUser();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: Response.json({ error: "Couldn't read the document." }, { status: 400 }) };
  }
  const parsed = documentInputSchema.safeParse(body);
  if (!parsed.success) return { error: Response.json({ error: parsed.error.issues[0]?.message ?? "Check the document." }, { status: 400 }) };
  if (!parsed.data.rows.some((r) => r.kind === "item")) return { error: Response.json({ error: "Add at least one item." }, { status: 400 }) };
  if (!parsed.data.to.split("\n")[0]?.trim()) return { error: Response.json({ error: "Enter the customer's name (first line of \"To\")." }, { status: 400 }) };
  const doc = await buildDocument(parsed.data);
  const extra = body as { dealId?: unknown; ownerId?: unknown; draftId?: unknown };
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);

  const excess = user.role === "HEAD" ? [] : await excessDiscounts(doc);
  const existing = isIssuedQuoteRef(parsed.data.ref)
    ? await prisma.quotation.findUnique({ where: { ref: parsed.data.ref }, select: { id: true, discountStatus: true, discountApproved: true } })
    : null;
  // Approved by the Head: it goes through while every over-the-limit line is
  // within what was approved for it (a bigger discount, or another item over
  // its limit, needs approving again).
  const held = excess.length > 0 && !(existing?.discountStatus === "approved" && coveredByApproval(excess, existing.discountApproved));
  if (held && !isIssuedQuoteRef(parsed.data.ref)) {
    return { error: Response.json({ error: "Only the Head of Sales can prepare a quote below the permissible discount." }, { status: 403 }) };
  }

  const saveError = await saveQuotation(user, parsed.data, doc, { dealId: str(extra.dealId), ownerId: str(extra.ownerId) });
  if (saveError) return { error: Response.json({ error: saveError }, { status: 409 }) };
  // Saved as the quotation now - the draft it was made from goes.
  const draftId = str(extra.draftId);
  if (draftId) await prisma.quotation.deleteMany({ where: { id: draftId, type: DRAFT_TYPE, OR: [{ createdById: user.id }, { ownerId: user.id }, ...(isBackOffice(user) ? [{}] : [])] } });

  if (held) {
    const q = await prisma.quotation.update({
      where: { ref: parsed.data.ref },
      data: { discountStatus: "pending", discountRequest: excess as unknown as Prisma.InputJsonValue, discountRequestedAt: new Date(), discountDecidedAt: null, discountDecidedById: null },
      select: { id: true },
    });
    await notifyQuoteDiscountRequested(q.id);
    // The limits themselves are the Head's to know - just which items.
    const lines = excess.map((l) => l.description).join("; ");
    return {
      error: Response.json(
        { error: `Not generated - only the Head of Sales can prepare a quote below the permissible discount (${lines}). It has been sent to the Head of Sales; or bring the discount within the limit.`, approval: "pending" },
        { status: 403 },
      ),
    };
  }
  // Discounts brought back within the limits: nothing left to approve.
  if (existing?.discountStatus === "pending" && excess.length === 0) {
    await prisma.quotation.update({ where: { id: existing.id }, data: { discountStatus: null } });
  }
  // The Head generating a quote that was sent to them prepares it: it's
  // approved as the Head saved it.
  if (user.role === "HEAD" && existing?.discountStatus === "pending") {
    const own = await excessDiscounts(doc);
    await prisma.quotation.update({
      where: { id: existing.id },
      data: { discountStatus: "approved", discountApproved: own as unknown as Prisma.InputJsonValue, discountDecidedAt: new Date(), discountDecidedById: user.id },
    });
    await notifyQuoteDiscountDecided(existing.id, true);
  }
  return { doc };
}
