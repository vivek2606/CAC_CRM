import { invoiceKey, invoiceTypeOf, type InvoiceType } from "@/lib/invoice-key";

// Rows of an uploaded products sheet (see parseWonItemsSheet), grouped into
// the invoices they were billed on - in the order each invoice first
// appears. Rows without an invoice no. aren't part of any invoice.
export type SheetRow = { productId: string; label: string; qty: number; unitPrice: number; invoiceNo: string; invoiceDate: string; company: string };
// company: "Sakuragi" / "Somotex", or "" when the sheet doesn't say.
// type: a sale, or a sales return (negative quantity or rate).
export type SheetInvoice = { invoiceNo: string; closedAt: string; company: string; type: InvoiceType; rows: SheetRow[] };

export function groupSheetInvoices(rows: SheetRow[]): SheetInvoice[] {
  const byKey = new Map<string, SheetInvoice>();
  for (const r of rows) {
    if (!r.invoiceNo) continue;
    // An invoice is its company + type + number (see invoice-key.ts): one
    // number can be a sale and a return, for either company.
    const type = invoiceTypeOf(r.qty * r.unitPrice);
    const key = invoiceKey(r.company, type, r.invoiceNo);
    if (!byKey.has(key)) byKey.set(key, { invoiceNo: r.invoiceNo, closedAt: r.invoiceDate, company: r.company, type, rows: [] });
    byKey.get(key)!.rows.push(r);
  }
  return [...byKey.values()];
}
