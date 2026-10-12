"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { nextQuoteRef } from "@/lib/quote-ref";
import { canSeeQuotation, resolveQuoteOwner } from "@/lib/saved-quotes";
import { applyQuoteToDeal } from "../deals/actions";
import { parseQuoteGrid, type Cell, type ImportedQuote } from "@/lib/import/parse-quote-sheet";

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
