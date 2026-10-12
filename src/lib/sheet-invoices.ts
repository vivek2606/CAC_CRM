// Rows of an uploaded products sheet (see parseWonItemsSheet), grouped into
// the invoices they were billed on - in the order each invoice first
// appears. Rows without an invoice no. aren't part of any invoice.
export type SheetRow = { productId: string; label: string; qty: number; unitPrice: number; invoiceNo: string; invoiceDate: string; company: string };
// company: "Sakuragi" / "Somotex", or "" when the sheet doesn't say.
export type SheetInvoice = { invoiceNo: string; closedAt: string; company: string; rows: SheetRow[] };

export function groupSheetInvoices(rows: SheetRow[]): SheetInvoice[] {
  const byNo = new Map<string, SheetInvoice>();
  for (const r of rows) {
    if (!r.invoiceNo) continue;
    // An invoice is its company + number: Sakuragi and Somotex number
    // their invoices separately, so one number can belong to both.
    const key = `${r.company}|${r.invoiceNo.toLowerCase()}`;
    if (!byNo.has(key)) byNo.set(key, { invoiceNo: r.invoiceNo, closedAt: r.invoiceDate, company: r.company, rows: [] });
    byNo.get(key)!.rows.push(r);
  }
  return [...byNo.values()];
}
