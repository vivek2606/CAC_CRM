import ExcelJS from "exceljs";

export type RawStockReceiptRow = {
  rowNumber: number;
  productCode: string;
  model: string | null;
  category: string | null;
  quantity: number;
  // null when the cell is blank - the upload form's default date applies.
  receivedAt: Date | null;
  // Basic, excl. VAT. null when blank (price unchanged).
  dealerPrice: number | null;
  note: string | null;
};

export type StockReceiptRowProblem = { rowNumber: number; problem: string };

// Column names are matched case-insensitively, and a few common variants
// are accepted so an existing sheet doesn't have to be renamed.
const COLUMNS = {
  productCode: ["product code", "item code", "code"],
  quantity: ["quantity", "qty", "qty received"],
  receivedAt: ["date received", "received date", "date", "date entered stock"],
  dealerPrice: ["dealer's price", "dealers price", "dealer price", "basic price"],
  model: ["model", "item name"],
  category: ["category"],
  note: ["note", "notes", "remarks"],
};

export const STOCK_RECEIPT_TEMPLATE_HEADERS = ["Product Code", "Model", "Category", "Quantity", "Date Received", "Dealer's Price", "Note"];

// Excel date cell, "2026-10-05", or day-first "05/10/2026" / "5-10-2026"
// (Nigerian convention), or "5 Oct 2026". Returned as UTC midnight.
export function parseReceiptDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  const s = String(v).trim();
  // Rejects impossible dates (e.g. 31/31/2026) instead of letting them roll
  // over into a different real date.
  const ymd = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
  };
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return ymd(Number(m[3]), Number(m[2]), Number(m[1]));
  const parsed = new Date(`${s} UTC`);
  if (!Number.isNaN(parsed.getTime())) return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  return null;
}

export function cellValue(v: ExcelJS.CellValue): unknown {
  if (v != null && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return (v as { result: unknown }).result;
    if ("text" in v) return (v as { text: unknown }).text;
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
  }
  return v;
}

export async function parseStockReceiptsBuffer(
  buffer: ArrayBuffer,
): Promise<{ rows: RawStockReceiptRow[]; problems: StockReceiptRowProblem[]; zeroQtyRows: number }> {
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
  const missing = [idx.productCode === -1 && "Product Code", idx.quantity === -1 && "Quantity"].filter(Boolean);
  if (missing.length > 0) throw new Error(`Missing expected column(s): ${missing.join(", ")}`);

  const rows: RawStockReceiptRow[] = [];
  const problems: StockReceiptRowProblem[] = [];
  // A blank quantity counts as 0, and a 0 row adds nothing - it's skipped
  // (and counted), not reported as an error.
  let zeroQtyRows = 0;
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (i: number) => (i === -1 ? null : cellValue(row.getCell(i).value));
    const str = (i: number) => {
      const v = get(i);
      const s = v == null ? "" : String(v).trim();
      return s === "" ? null : s;
    };
    const num = (i: number) => {
      const v = get(i);
      if (v == null || v === "") return null;
      const n = typeof v === "number" ? v : Number(String(v).replace(/[₦,\s]/g, ""));
      return Number.isNaN(n) ? NaN : n;
    };

    const productCode = str(idx.productCode);
    const quantity = num(idx.quantity);
    if (!productCode && quantity == null) return; // blank row
    if (!productCode) return void problems.push({ rowNumber, problem: "No product code" });
    if (quantity == null || quantity === 0) return void zeroQtyRows++;
    if (Number.isNaN(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
      return void problems.push({ rowNumber, problem: `Quantity must be a whole number, 0 or more (${productCode})` });
    }
    const rawDate = get(idx.receivedAt);
    const receivedAt = parseReceiptDate(rawDate);
    if (rawDate != null && rawDate !== "" && !receivedAt) {
      return void problems.push({ rowNumber, problem: `Couldn't read the date "${String(rawDate)}" (${productCode})` });
    }
    const dealerPrice = num(idx.dealerPrice);
    if (dealerPrice != null && (Number.isNaN(dealerPrice) || dealerPrice <= 0)) {
      return void problems.push({ rowNumber, problem: `Dealer's price must be a number above 0 (${productCode})` });
    }

    rows.push({
      rowNumber,
      productCode,
      model: str(idx.model),
      category: str(idx.category),
      quantity,
      receivedAt,
      dealerPrice,
      note: str(idx.note),
    });
  });
  return { rows, problems, zeroQtyRows };
}
