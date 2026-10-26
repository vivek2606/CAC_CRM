"use server";

import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireHead, canAccessOwner, isBackOffice } from "@/lib/rbac";
import { binQuotation } from "@/lib/recycle-bin";
import { dealOwnerProblem, dealOwnerOptions } from "@/lib/deal-owner";
import { nextQuoteRef } from "@/lib/quote-ref";
import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { canSeeQuotation, resolveQuoteOwner, DRAFT_TYPE } from "@/lib/saved-quotes";
import { documentInputSchema } from "@/lib/sales-document";
import { applyQuoteToDeal } from "../deals/actions";
import { parseQuoteGrid, type Cell, type ImportedQuote } from "@/lib/import/parse-quote-sheet";
import { isIssuedQuoteRef } from "@/lib/document-format";

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

// Everything the "Link deal" dialog needs: the sales person's deals, and
// for creating a new deal / lead - the people it can be under (Head /
// Coordinator only; others create their own) and the quote's customer.
export async function quoteLinkContext(quoteId: string): Promise<{
  deals: { id: string; label: string }[];
  owners: { id: string; name: string }[] | null;
  defaultOwnerId: string;
  customerName: string;
}> {
  const { user } = await quoteForLinking(quoteId);
  const q = await prisma.quotation.findUniqueOrThrow({ where: { id: quoteId }, select: { ownerId: true, customerName: true } });
  const owners = isBackOffice(user) ? await dealOwnerOptions() : null;
  return {
    deals: await dealOptionsForQuote(quoteId),
    owners,
    defaultOwnerId: owners ? (owners.some((o) => o.id === q.ownerId) ? q.ownerId : user.role === "HEAD" ? user.id : "") : user.id,
    customerName: q.customerName ?? "",
  };
}

// "Link deal" when the deal doesn't exist yet: a new deal for the quote
// (at Proposal, with the quote's products), or a new lead converted to
// that deal straight away - so the enquiry counts in lead-to-deal
// conversion. A quote always sits on a deal, never on a lead alone.
export async function createForQuote(
  quoteId: string,
  input: { kind: "deal" | "lead"; title: string; ownerId?: string; phone?: string },
): Promise<{ dealId?: string; leadId?: string; error?: string }> {
  const { user } = await quoteForLinking(quoteId);
  const q = await prisma.quotation.findUniqueOrThrow({ where: { id: quoteId }, select: { ref: true, dealId: true, customerName: true } });
  if (q.dealId) return { error: "This quotation is already linked to a deal." };
  const title = input.title.trim();
  if (!title) return { error: `Enter a name for the ${input.kind}.` };
  const res = await createDealForQuote(q.ref, title, input.ownerId);
  if (res.error || !res.dealId) return { error: res.error ?? "Couldn't create the deal." };
  const phone = input.phone?.trim() || null;
  if (phone) await prisma.deal.update({ where: { id: res.dealId }, data: { customerPhone: phone.slice(0, 40) } });
  if (input.kind === "deal") return { dealId: res.dealId };

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: res.dealId }, select: { ownerId: true, value: true, createdAt: true } });
  const lead = await prisma.lead.create({
    data: {
      title: title.slice(0, 200),
      customerName: q.customerName || null,
      company: q.customerName || null,
      phone,
      status: "CONVERTED",
      value: deal.value,
      ownerId: deal.ownerId,
      convertedDealId: res.dealId,
      createdAt: deal.createdAt,
    },
    select: { id: true },
  });
  await audit("lead", lead.id, user.id, "created", `From quotation ${q.ref} - converted to its deal straight away.`);
  revalidatePath("/leads");
  return { dealId: res.dealId, leadId: lead.id };
}

export async function linkQuotationDeal(quoteId: string, dealId: string | null): Promise<{ error?: string }> {
  const { user, q } = await quoteForLinking(quoteId);
  if (dealId) {
    const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { ownerId: true } });
    if (!deal || !canAccessOwner(user, deal.ownerId)) return { error: "Deal not found." };
  }
  await prisma.quotation.update({ where: { id: q.id }, data: { dealId } });
  // A deal with no products yet takes the quote's.
  if (dealId) await applyQuoteToDeal(q.id, true);
  revalidatePath("/quotations/saved");
  if (dealId) revalidatePath(`/deals/${dealId}`);
  return {};
}

// Reads a quotation made in Excel into the builder's rows (see
// parse-quote-sheet.ts). The first worksheet with an item table is used.
export async function importQuoteSheet(formData: FormData): Promise<ImportedQuote> {
  await requireUser();
  const empty: ImportedQuote = { rows: [], to: "", attention: "", title: "", vatInclusive: null, withInstallation: false, problems: [] };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ...empty, problems: ["Choose a file."] };
  if (/\.xls$/i.test(file.name)) return { ...empty, problems: ["This is an old .xls file - open it in Excel, Save As .xlsx and upload that."] };
  const ExcelJS = (await import("exceljs")).default;
  const { cellValue } = await import("@/lib/import/parse-stock-receipts");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return { ...empty, problems: ["Couldn't read the file - upload an Excel (.xlsx) file."] };
  }
  const products = await prisma.product.findMany({ select: { id: true, code: true, model: true } });
  let first: ImportedQuote | null = null;
  for (const ws of wb.worksheets) {
    const grid: Cell[][] = [];
    const cols = Math.min(ws.columnCount, 40);
    for (let r = 1; r <= Math.min(ws.rowCount, 1000); r++) {
      const row: Cell[] = [];
      for (let c = 1; c <= cols; c++) {
        const v = cellValue(ws.getCell(r, c).value);
        row.push(v == null || typeof v === "string" || typeof v === "number" || v instanceof Date ? (v as Cell) : String(v));
      }
      grid.push(row);
    }
    const result = parseQuoteGrid(grid, products);
    if (result.rows.some((x) => x.kind === "item")) return result;
    first ??= result;
  }
  return first ?? { ...empty, problems: ["The file has no worksheets."] };
}

// After a quotation is downloaded with no deal: make one for it - in the
// Quotation stage, for its customer - and link the quote, which fills the
// deal's products (and account, when the customer name matches one). A
// sales person's goes under them; the Head / Coordinator pick the sales
// person (the Head may keep it), never the Coordinator - and the quote
// moves under that sales person too.
export async function createDealForQuote(ref: string, title: string, ownerId?: string): Promise<{ dealId?: string; quoteId?: string; error?: string }> {
  const user = await requireUser();
  const q = await prisma.quotation.findUnique({
    where: { ref },
    select: { id: true, ownerId: true, createdById: true, dealId: true, customerName: true, total: true, data: true, deal: { select: { ownerId: true } } },
  });
  if (!q || !canSeeQuotation(user, q)) return { error: "Download the quotation first - then it can be linked to a deal." };
  if (q.dealId) return { dealId: q.dealId, quoteId: q.id };
  const dealOwner = isBackOffice(user) ? ownerId || (user.role === "HEAD" ? user.id : "") : user.id;
  if (!dealOwner) return { error: "Pick the sales person this deal is for." };
  const ownerProblem = await dealOwnerProblem(dealOwner);
  if (ownerProblem) return { error: ownerProblem };
  const name = title.trim() || q.customerName || ref;
  const { STAGE_DEFAULT_PROBABILITY } = await import("@/lib/constants");
  const deal = await prisma.deal.create({
    data: {
      title: name.slice(0, 200),
      stage: "PROPOSAL",
      stageChangedAt: new Date(),
      probability: STAGE_DEFAULT_PROBABILITY.PROPOSAL,
      customerName: q.customerName || null,
      ownerId: dealOwner,
    },
    select: { id: true },
  });
  await prisma.quotation.update({ where: { id: q.id }, data: { dealId: deal.id, ownerId: dealOwner } });
  await audit("deal", deal.id, user.id, "created", `From quotation ${ref}.`);
  const filled = await applyQuoteToDeal(q.id, true);
  // Only custom lines (no products): the deal takes the quote's value (excl. VAT).
  if (filled.count === 0) {
    const { getCompanySettings } = await import("@/lib/company-profile");
    const vat = 1 + (await getCompanySettings()).vatRatePct / 100;
    await prisma.deal.update({ where: { id: deal.id }, data: { value: Math.round((q.total / vat) * 100) / 100 } });
  }
  revalidatePath("/quotations/saved");
  revalidatePath("/deals");
  return { dealId: deal.id, quoteId: q.id };
}

// Saves the builder's quotation as a draft (not downloaded yet), for the
// sales person it's for - creating it, or updating the draft it was opened
// from. Returns the draft's id.
export async function saveQuoteDraft(
  input: unknown,
  opts: { draftId?: string | null; dealId?: string | null; ownerId?: string | null },
): Promise<{ draftId?: string; error?: string }> {
  const user = await requireUser();
  const parsed = documentInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the quotation." };
  const owner = await resolveQuoteOwner(user, opts.ownerId ?? null);
  if (!owner) return { error: "Pick the sales person this quotation is for." };
  let dealId: string | null = null;
  if (opts.dealId) {
    const d = await prisma.deal.findUnique({ where: { id: opts.dealId }, select: { id: true, ownerId: true } });
    if (d && canAccessOwner(user, d.ownerId)) dealId = d.id;
  }
  // A draft of a quotation already issued keeps its number - downloaded, it
  // updates that quotation; a new one gets its number when downloaded.
  const data = { ...parsed.data, ref: isIssuedQuoteRef(parsed.data.ref) ? parsed.data.ref : "" };
  const fields = {
    customerName: parsed.data.to.split("\n")[0]?.trim() ?? "",
    total: 0,
    data: data as unknown as Prisma.InputJsonValue,
    ownerId: owner.id,
    dealId,
  };
  if (opts.draftId) {
    const existing = await prisma.quotation.findUnique({ where: { id: opts.draftId }, select: { type: true, ownerId: true, createdById: true, deal: { select: { ownerId: true } } } });
    if (existing && existing.type === DRAFT_TYPE && canSeeQuotation(user, existing)) {
      await prisma.quotation.update({ where: { id: opts.draftId }, data: fields });
      revalidatePath("/quotations/saved");
      return { draftId: opts.draftId };
    }
  }
  const created = await prisma.quotation.create({
    data: { ...fields, type: DRAFT_TYPE, ref: `DRAFT-${crypto.randomUUID()}`, createdById: user.id },
    select: { id: true },
  });
  revalidatePath("/quotations/saved");
  return { draftId: created.id };
}

// Discards a saved draft (never a downloaded quotation).
export async function discardQuoteDraft(draftId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const q = await prisma.quotation.findUnique({ where: { id: draftId }, select: { type: true, ownerId: true, createdById: true, deal: { select: { ownerId: true } } } });
  if (!q || q.type !== DRAFT_TYPE || !canSeeQuotation(user, q)) return { error: "Draft not found." };
  await prisma.quotation.delete({ where: { id: draftId } });
  revalidatePath("/quotations/saved");
  return {};
}

// The Head deletes a saved quotation (or draft) - it goes to the recycle
// bin for 30 days, from where it can be restored.
export async function deleteQuotation(id: string): Promise<{ error?: string }> {
  const user = await requireHead();
  const q = await prisma.quotation.findUnique({ where: { id }, select: { id: true, dealId: true } });
  if (!q) return { error: "This quotation no longer exists." };
  await binQuotation(id, user.id);
  await prisma.quotation.delete({ where: { id } });
  revalidatePath("/quotations/saved");
  if (q.dealId) revalidatePath(`/deals/${q.dealId}`);
  return {};
}
