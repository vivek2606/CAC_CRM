import ExcelJS from "exceljs";

export type RawTargetRow = {
  salesPerson: string;
  month: string; // raw text as entered, parsed later
  target: number;
};

const REQUIRED_COLUMNS = ["Sales Person", "Month", "Target"];

// Accepts "2026-08", "Aug-2026", "August 2026", "8/2026", or a real Excel date.
export function parseMonthText(raw: string): Date | null {
  const s = raw.trim();

  const isoMatch = s.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMatch) return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, 1));

  const slashMatch = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMatch) return new Date(Date.UTC(Number(slashMatch[2]), Number(slashMatch[1]) - 1, 1));

  const MONTHS = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  const textMatch = s.toLowerCase().match(/^([a-z]+)[\s-]+(\d{4})$/);
  if (textMatch) {
    const idx = MONTHS.findIndex((m) => textMatch[1].startsWith(m));
    if (idx !== -1) return new Date(Date.UTC(Number(textMatch[2]), idx, 1));
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
  }

  return null;
}

export async function parseTargetsBuffer(
  buffer: ArrayBuffer
): Promise<{ rows: RawTargetRow[]; skippedRows: number }> {
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

  const rows: RawTargetRow[] = [];
  let skippedRows = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const getStr = (col: string): string | null => {
      const v = row.getCell(idx(col)).value;
      if (v == null) return null;
      if (v instanceof Date) return v.toISOString().slice(0, 7);
      if (typeof v === "object" && "result" in (v as object)) {
        const r = (v as { result: unknown }).result;
        return r == null ? null : String(r).trim() || null;
      }
      const s = String(v).trim();
      return s === "" ? null : s;
    };
    const getNum = (col: string): number | null => {
      const v = row.getCell(idx(col)).value;
      if (typeof v === "number") return v;
      if (v == null) return null;
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    };

    const salesPerson = getStr("Sales Person");
    const month = getStr("Month");
    const target = getNum("Target");
    if (!salesPerson || !month || target == null) {
      skippedRows++;
      return;
    }

    rows.push({ salesPerson, month, target });
  });

  return { rows, skippedRows };
}
