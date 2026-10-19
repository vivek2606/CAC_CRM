import ExcelJS from "exceljs";
import { cellValue, parseReceiptDate } from "./parse-stock-receipts";

// The Head's bulk correction sheet for won deals: one row per product line
// of an invoice. Blank cells leave that detail of the deal as it is.
export type RawWonUpdateRow = {
  rowNumber: number;
  invoiceNo: string;
  leadDate: Date | null;
  conversionDate: Date | null;
  wonDate: Date | null;
  customerCode: string | null;
  company: string | null;
  productCode: string | null;
  productName: string | null;
  qty: number | null;
  rate: number | null;
  salesPerson: string | null;
};

export type WonUpdateRowProblem = { rowNumber: number; problem: string };

const COLUMNS = {
  leadDate: ["lead date", "lead created", "lead created on", "lead created date"],
  conversionDate: ["conversion date", "conversion to deal date", "converted to deal", "converted to deal on", "deal date", "lead to deal date", "conversion to deal"],
  wonDate: ["won date", "won on", "invoice date", "date won", "closing date", "closed on", "date"],
  invoiceNo: ["invoice no", "invoice no.", "invoice number", "invoice #", "inv no", "inv. no.", "invoice", "txn no", "doc no"],
  customerCode: ["customer code", "cust code", "account code", "customer id", "cust. code"],
  company: ["company", "company name", "billing company", "billed by", "entity"],
  productCode: ["item code", "product code", "code", "item no", "item no."],
  productName: ["product", "product name", "item name", "model", "item", "description"],
  qty: ["quantity", "qty", "qty."],
  rate: ["rate", "basic rate", "unit price", "price", "rate (excl. vat)", "net rate"],
  salesPerson: ["sales person", "salesperson", "sales person name", "salesman", "salesmen", "owner"],
};

export const WON_UPDATE_TEMPLATE_HEADERS = [
  "Lead Date",
  "Conversion Date",
  "Won Date",
  "Invoice No",
  "Customer Code",
  "Company",
  "Product",
  "Quantity",
  "Rate",
  "Sales Person",
];

// Excel stores dates as dates, or as serial numbers when the cell isn't
// formatted as a date; typed ones as dd/mm/yyyy, yyyy-mm-dd or "12 Sep 2026".
function toDate(v: unknown): Date | null {
  if (typeof v === "number") return v > 20000 && v < 80000 ? new Date(Math.round((v - 25569) * 86400000)) : null;
  return parseReceiptDate(v);
}

export async function parseWonDealUpdatesBuffer(
  buffer: ArrayBuffer,
): Promise<{ rows: RawWonUpdateRow[]; problems: WonUpdateRowProblem[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The uploaded file has no worksheets.");

  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cellValue(cell.value) ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  });
  const col = (names: string[]) => headers.findIndex((h) => h != null && names.includes(h));
  const idx = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, col(names)])) as Record<keyof typeof COLUMNS, number>;
  if (idx.invoiceNo === -1) throw new Error("Missing the Invoice No column - it says which won deal each row updates.");
  if ((idx.qty === -1) !== (idx.rate === -1)) throw new Error("Quantity and Rate go together - add both columns, or neither.");
  if (idx.qty !== -1 && idx.productCode === -1 && idx.productName === -1) throw new Error("Missing the Product column for the quantities and rates.");

  const rows: RawWonUpdateRow[] = [];
  const problems: WonUpdateRowProblem[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (i: number) => (i === -1 ? null : cellValue(row.getCell(i).value));
    const str = (i: number) => {
      const v = get(i);
      const s = v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
      return s === "" ? null : s;
    };
    const date = (i: number, label: string) => {
      const v = get(i);
      if (v == null || String(v).trim() === "") return null;
      const d = toDate(v);
      if (!d) problems.push({ rowNumber, problem: `Couldn't read the ${label} "${String(v)}" - use dd/mm/yyyy` });
      return d;
    };
    const num = (i: number) => {
      const v = get(i);
      if (v == null || String(v).trim() === "") return null;
      const n = typeof v === "number" ? v : Number(String(v).replace(/[₦,\s]/g, ""));
      return Number.isFinite(n) ? n : NaN;
    };

    const invoiceNo = str(idx.invoiceNo);
    const productCode = str(idx.productCode);
    const productName = str(idx.productName);
    const qty = num(idx.qty);
    const rate = num(idx.rate);
    const cells = [idx.leadDate, idx.conversionDate, idx.wonDate, idx.customerCode, idx.company, idx.salesPerson].map(str);
    if (!invoiceNo && !productCode && !productName && qty == null && rate == null && cells.every((c) => c == null)) return; // blank row
    if (!invoiceNo) return void problems.push({ rowNumber, problem: "No invoice no." });

    const before = problems.length;
    const leadDate = date(idx.leadDate, "lead date");
    const conversionDate = date(idx.conversionDate, "conversion date");
    const wonDate = date(idx.wonDate, "won date");
    if (productCode || productName) {
      if (qty == null || rate == null || Number.isNaN(qty) || Number.isNaN(rate) || qty === 0 || rate === 0) {
        problems.push({ rowNumber, problem: `Enter a quantity and a rate other than 0 for ${productCode ?? productName}` });
      }
    } else if (qty != null || rate != null) {
      problems.push({ rowNumber, problem: "A quantity / rate without a product" });
    }
    if (problems.length > before) return;

    rows.push({
      rowNumber,
      invoiceNo,
      leadDate,
      conversionDate,
      wonDate,
      customerCode: str(idx.customerCode),
      company: str(idx.company),
      productCode,
      productName,
      qty: productCode || productName ? qty : null,
      rate: productCode || productName ? rate : null,
      salesPerson: str(idx.salesPerson),
    });
  });
  return { rows, problems };
}
