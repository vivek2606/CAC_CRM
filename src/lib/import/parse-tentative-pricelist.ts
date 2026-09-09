import ExcelJS from "exceljs";

export type RawTentativePriceRow = {
  model: string;
  dealerPrice: number;
};

const REQUIRED_COLUMNS = ["MODEL", "Dealer's Price"];

export async function parseTentativePricelistBuffer(
  buffer: ArrayBuffer
): Promise<{ rows: RawTentativePriceRow[]; skippedRows: number }> {
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

  const rows: RawTentativePriceRow[] = [];
  let skippedRows = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const getRaw = (col: string): unknown => row.getCell(idx(col)).value;
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
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    };

    const model = getStr("MODEL");
    const dealerPrice = getNum("Dealer's Price");

    if (!model || dealerPrice == null) {
      skippedRows++;
      return;
    }

    rows.push({ model, dealerPrice });
  });

  return { rows, skippedRows };
}
