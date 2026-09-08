import ExcelJS from "exceljs";

// Column names match the New Lead form's field labels exactly (minus the
// "*"/"?"/"(₦)" decoration), so anyone filling the sheet can just look at
// the form to know what goes in each column.
export type RawLeadRow = {
  title: string;
  date: Date | null;
  customerName: string;
  company: string | null;
  value: number | null;
  status: string | null;
  winProbability: number | null;
  budgetConfirmed: string | null;
  expectedPurchaseTimeframe: string | null;
  source: string | null;
  equipmentType: string | null;
  endUseSegment: string | null;
  competitorBrand: string | null;
  email: string | null;
  phone: string;
  linkedAccount: string | null;
  linkedContact: string | null;
  assignedTo: string;
  notes: string | null;
};

const REQUIRED_COLUMNS = [
  "Lead title",
  "Date",
  "Customer name",
  "Company",
  "Estimated value",
  "Status",
  "Winning probability",
  "Budget confirmed",
  "Expected purchase timeframe",
  "Source",
  "Equipment type",
  "End-use segment",
  "Competing brand",
  "Email",
  "Customer phone",
  "Linked account",
  "Linked contact",
  "Assigned to",
  "Notes",
];

export async function parseLeadsRegisterBuffer(
  buffer: ArrayBuffer
): Promise<{ rows: RawLeadRow[]; skippedRows: number }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The uploaded file has no worksheets.");

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const idx = (name: string) => headers.findIndex((h) => h?.trim() === name);
  const missing = REQUIRED_COLUMNS.filter((c) => idx(c) === -1);
  if (missing.length > 0) {
    throw new Error(`Missing expected column(s): ${missing.join(", ")}`);
  }

  const rows: RawLeadRow[] = [];
  let skippedRows = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const getRaw = (col: string): unknown => row.getCell(idx(col)).value;
    const getStr = (col: string): string | null => {
      const v = getRaw(col);
      if (v == null) return null;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (typeof v === "object" && "result" in (v as object)) {
        const r = (v as { result: unknown }).result;
        return r == null ? null : String(r).trim() || null;
      }
      if (typeof v === "object" && "text" in (v as object)) {
        return String((v as { text: unknown }).text).trim() || null;
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
    const getDate = (col: string): Date | null => {
      const v = getRaw(col);
      if (v instanceof Date) return v;
      if (v == null) return null;
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const title = getStr("Lead title");
    const customerName = getStr("Customer name");
    const phone = getStr("Customer phone");
    const assignedTo = getStr("Assigned to");
    if (!title || !customerName || !phone || !assignedTo) {
      skippedRows++;
      return;
    }

    rows.push({
      title,
      date: getDate("Date"),
      customerName,
      company: getStr("Company"),
      value: getNum("Estimated value"),
      status: getStr("Status"),
      winProbability: getNum("Winning probability"),
      budgetConfirmed: getStr("Budget confirmed"),
      expectedPurchaseTimeframe: getStr("Expected purchase timeframe"),
      source: getStr("Source"),
      equipmentType: getStr("Equipment type"),
      endUseSegment: getStr("End-use segment"),
      competitorBrand: getStr("Competing brand"),
      email: getStr("Email"),
      phone,
      linkedAccount: getStr("Linked account"),
      linkedContact: getStr("Linked contact"),
      assignedTo,
      notes: getStr("Notes"),
    });
  });

  return { rows, skippedRows };
}
