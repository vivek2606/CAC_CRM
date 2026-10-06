import ExcelJS from "exceljs";
import { cellValue, parseReceiptDate } from "./parse-stock-receipts";

// Project vs service isn't a column: it follows the sales person (the
// Service Manager's lines are service billing, everyone else's project).
export type RawProjectBillingRow = {
  rowNumber: number;
  date: Date;
  invoiceNo: string | null;
  customer: string;
  salesPerson: string;
  description: string | null;
  value: number; // net, negative for a credit note
};

export type ProjectBillingRowProblem = { rowNumber: number; problem: string };

const COLUMNS = {
  date: ["date", "doc date", "invoice date", "billing date"],
  invoiceNo: ["invoice no", "invoice no.", "invoice number", "invoice #", "txn no", "doc no"],
  customer: ["customer", "customer name", "cust name"],
  salesPerson: ["sales person", "salesperson", "salesmen", "salesman"],
  description: ["description", "item name", "details", "item"],
  value: ["value", "amount", "net amt", "net amount"],
};

export const PROJECT_BILLING_TEMPLATE_HEADERS = ["Date", "Invoice No", "Customer", "Sales Person", "Description", "Value"];

export async function parseProjectBillingBuffer(
  buffer: ArrayBuffer,
): Promise<{ rows: RawProjectBillingRow[]; problems: ProjectBillingRowProblem[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The uploaded file has no worksheets.");

  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cellValue(cell.value) ?? "").trim().toLowerCase();
  });
  const col = (names: string[]) => headers.findIndex((h) => h != null && names.includes(h));
  const idx = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, col(names)])) as Record<keyof typeof COLUMNS, number>;
  const missing = [
    idx.date === -1 && "Date",
    idx.customer === -1 && "Customer",
    idx.salesPerson === -1 && "Sales Person",
    idx.value === -1 && "Value",
  ].filter(Boolean);
  if (missing.length > 0) throw new Error(`Missing expected column(s): ${missing.join(", ")}`);

  const rows: RawProjectBillingRow[] = [];
  const problems: ProjectBillingRowProblem[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (i: number) => (i === -1 ? null : cellValue(row.getCell(i).value));
    const str = (i: number) => {
      const v = get(i);
      const s = v == null ? "" : String(v).trim();
      return s === "" ? null : s;
    };
    const customer = str(idx.customer);
    const salesPerson = str(idx.salesPerson);
    const rawValue = get(idx.value);
    if (!customer && !salesPerson && (rawValue == null || rawValue === "")) return; // blank row

    const rawDate = get(idx.date);
    const date = parseReceiptDate(rawDate);
    if (!date) return void problems.push({ rowNumber, problem: rawDate ? `Couldn't read the date "${String(rawDate)}"` : "No date" });
    if (!customer) return void problems.push({ rowNumber, problem: "No customer" });
    if (!salesPerson) return void problems.push({ rowNumber, problem: "No sales person" });
    const value = typeof rawValue === "number" ? rawValue : Number(String(rawValue ?? "").replace(/[₦,\s]/g, ""));
    if (rawValue == null || rawValue === "" || Number.isNaN(value) || value === 0) {
      return void problems.push({ rowNumber, problem: `Value must be a number other than 0 (${customer})` });
    }

    rows.push({
      rowNumber,
      date,
      invoiceNo: str(idx.invoiceNo),
      customer,
      salesPerson,
      description: str(idx.description),
      value,
    });
  });
  return { rows, problems };
}
