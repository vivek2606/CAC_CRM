// Rows of an uploaded products sheet (see parseWonItemsSheet), grouped into
// the invoices they were billed on - in the order each invoice first
// appears. Rows without an invoice no. aren't part of any invoice.
export type SheetRow = { productId: string; label: string; qty: number; unitPrice: number; invoiceNo: string; invoiceDate: string; company: string };
// company: "Sakuragi" / "Somotex" (the first row of the invoice that has one), or "".
export type SheetInvoice = { invoiceNo: string; closedAt: string; company: string; rows: SheetRow[] };

export function groupSheetInvoices(rows: SheetRow[]): SheetInvoice[] {
  const byNo = new Map<string, SheetInvoice>();
  for (const r of rows) {
    if (!r.invoiceNo) continue;
    const key = r.invoiceNo.toLowerCase();
    if (!byNo.has(key)) byNo.set(key, { invoiceNo: r.invoiceNo, closedAt: r.invoiceDate, company: "", rows: [] });
    const inv = byNo.get(key)!;
    if (!inv.company && r.company) inv.company = r.company;
    inv.rows.push(r);
  }
  return [...byNo.values()];
}
