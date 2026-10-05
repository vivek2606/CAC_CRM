import ExcelJS from "exceljs";
import { normalizeCategory } from "./category";

export type RawPricelistRow = {
  productCode: string;
  model: string;
  category: string;
  // Price columns are optional, so a quantities-only opening stock sheet
  // works too. A row with no Dealer's Price leaves the item's price as is.
  month: Date | null;
  quantity: number;
  landedCost: number | null;
  dealerPrice: number | null;
};

const REQUIRED_COLUMNS = ["PRODUCT CODE", "MODEL", "CATEGORY", "Quantity"];

function parseMonthCell(value: unknown): Date | null {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
  if (value == null) return null;
  const s = String(value).trim();
  if (s === "") return null;
  const ym = s.match(/^(\d{4})-(\d{1,2})$/);
  if (ym) return new Date(Date.UTC(Number(ym[1]), Number(ym[2]) - 1, 1));
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
}

export async function parsePricelistBuffer(
  buffer: ArrayBuffer
): Promise<{ rows: RawPricelistRow[]; skippedRows: number }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The uploaded file has no worksheets.");

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const idx = (name: string) => headers.findIndex((h) => h?.trim().toLowerCase() === name.toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => idx(c) === -1);
  if (missing.length > 0) {
    throw new Error(`Missing expected column(s): ${missing.join(", ")}`);
  }

  const rows: RawPricelistRow[] = [];
  let skippedRows = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const getRaw = (col: string): unknown => (idx(col) === -1 ? null : row.getCell(idx(col)).value);
    const getStr = (col: string): string | null => {
      const v = getRaw(col);
      if (v == null) return null;
      if (typeof v === "object" && "result" in (v as object)) {
        const r = (v as { result: unknown }).result;
        return r == null ? null : String(r).trim() || null;
      }
      const s = String(v).trim();
      return s === "" ? null : s;
    };
    const getNum = (col: string): number | null => {
      const v = getRaw(col);
      if (typeof v === "number") return v;
      if (v == null) return null;
      const raw = typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result : v;
      if (typeof raw === "number") return raw;
      // A blank cell means "no value" (e.g. no price), never 0.
      const text = String(raw ?? "").replace(/[₦,\s]/g, "");
      if (text === "") return null;
      const n = Number(text);
      return Number.isNaN(n) ? null : n;
    };

    const productCode = getStr("PRODUCT CODE");
    const model = getStr("MODEL");
    const rawCategory = getStr("CATEGORY");
    const category = rawCategory ? normalizeCategory(rawCategory) : null;
    const month = parseMonthCell(getRaw("MONTH"));
    const quantity = getNum("Quantity");
    const landedCost = getNum("Landed Cost");
    const dealerPrice = getNum("Dealer's Price");

    if (!productCode || !model || !category || quantity == null) {
      skippedRows++;
      return;
    }

    rows.push({ productCode, model, category, month, quantity, landedCost, dealerPrice });
  });

  return { rows, skippedRows };
}
