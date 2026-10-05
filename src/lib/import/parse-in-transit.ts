import ExcelJS from "exceljs";
import { cellValue, parseReceiptDate, type StockReceiptRowProblem } from "./parse-stock-receipts";

export type RawInTransitRow = {
  rowNumber: number;
  productCode: string;
  model: string | null;
  category: string | null;
  quantity: number;
  eta: Date | null;
  orderedAt: Date | null;
  reference: string | null;
  note: string | null;
};

const COLUMNS = {
  productCode: ["product code", "item code", "code"],
  quantity: ["quantity", "qty"],
  eta: ["eta", "expected arrival", "tentative arrival", "arrival date", "eta date"],
  orderedAt: ["order date", "ordered on", "date ordered"],
  reference: ["reference", "ref", "po", "po no", "container", "container no"],
  model: ["model", "item name"],
  category: ["category"],
  note: ["note", "notes", "remarks"],
};

export const IN_TRANSIT_TEMPLATE_HEADERS = ["Product Code", "Model", "Category", "Quantity", "ETA", "Order Date", "Reference", "Note"];

// Same shape and rules as the stock-received sheet: Product Code and
// Quantity required; ETA and Order Date take Excel dates, YYYY-MM-DD or
// day-first DD/MM/YYYY.
export async function parseInTransitBuffer(
  buffer: ArrayBuffer,
): Promise<{ rows: RawInTransitRow[]; problems: StockReceiptRowProblem[] }> {
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

  const rows: RawInTransitRow[] = [];
  const problems: StockReceiptRowProblem[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (i: number) => (i === -1 ? null : cellValue(row.getCell(i).value));
    const str = (i: number) => {
      const v = get(i);
      const s = v == null ? "" : String(v).trim();
      return s === "" ? null : s;
    };
    const date = (i: number, label: string, code: string): Date | null | undefined => {
      const raw = get(i);
      if (raw == null || raw === "") return null;
      const d = parseReceiptDate(raw);
      if (!d) {
        problems.push({ rowNumber, problem: `Couldn't read the ${label} "${String(raw)}" (${code})` });
        return undefined;
      }
      return d;
    };

    const productCode = str(idx.productCode);
    const rawQty = get(idx.quantity);
    if (!productCode && (rawQty == null || rawQty === "")) return; // blank row
    if (!productCode) return void problems.push({ rowNumber, problem: "No product code" });
    const quantity = typeof rawQty === "number" ? rawQty : Number(String(rawQty ?? "").replace(/[,\s]/g, ""));
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return void problems.push({ rowNumber, problem: `Quantity must be a whole number above 0 (${productCode})` });
    }
    const eta = date(idx.eta, "ETA", productCode);
    const orderedAt = date(idx.orderedAt, "order date", productCode);
    if (eta === undefined || orderedAt === undefined) return;

    rows.push({
      rowNumber,
      productCode,
      model: str(idx.model),
      category: str(idx.category),
      quantity,
      eta,
      orderedAt,
      reference: str(idx.reference),
      note: str(idx.note),
    });
  });
  return { rows, problems };
}
