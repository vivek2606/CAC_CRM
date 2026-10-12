// What identifies an invoice: its number, the company that raised it
// (Sakuragi / Somotex) and its type - a sale or a sales return. Each company
// numbers its sales and its returns separately, so the same number can be a
// Sakuragi sale, a Sakuragi return, a Somotex sale and a Somotex return.
// In the CRM a sales return is an invoice whose total is negative.

export type InvoiceType = "sale" | "return";

export const invoiceTypeOf = (total: number): InvoiceType => (total < 0 ? "return" : "sale");

export const INVOICE_TYPE_LABEL: Record<InvoiceType, string> = { sale: "Sale", return: "Sales return" };

export const invoiceKey = (company: string | null | undefined, type: InvoiceType, invoiceNo: string) =>
  `${company ?? ""}|${type}|${invoiceNo.trim().toLowerCase()}`;
