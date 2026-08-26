import ExcelJS from "exceljs";

export type RawLeadRow = {
  slNo: number;
  salesPerson: string;
  location: string | null;
  projectName: string | null;
  contactPerson: string;
  contactNo: string | null;
  leadSource: string | null;
  influencerDetails: string | null;
  customerName: string | null;
  site: string | null;
  equipment: string | null;
  amount: number | null;
  quoteSent: string | null;
  status: string | null;
  currentStatus: string | null;
};

const REQUIRED_COLUMNS = [
  "Sl. No.",
  "Sales Person",
  "Location",
  "Project Name",
  "Contact Person",
  "Contact No.",
  "Lead Source",
  "Influencer Details",
  "Customer Name",
  "Site",
  "Equipment",
  "Amount",
  "Quote Sent",
  "Status",
  "Current Status",
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

  // Header names have trailing/inconsistent whitespace in the source file (e.g. "Amount ").
  const idx = (name: string) => headers.findIndex((h) => h?.trim() === name || h?.trim() === `${name} `);
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

    const slNo = getNum("Sl. No.");
    const salesPerson = getStr("Sales Person");
    const contactPerson = getStr("Contact Person");
    if (slNo == null || !salesPerson || !contactPerson) {
      skippedRows++;
      return;
    }

    rows.push({
      slNo,
      salesPerson,
      location: getStr("Location"),
      projectName: getStr("Project Name"),
      contactPerson,
      contactNo: getStr("Contact No."),
      leadSource: getStr("Lead Source"),
      influencerDetails: getStr("Influencer Details"),
      customerName: getStr("Customer Name"),
      site: getStr("Site"),
      equipment: getStr("Equipment"),
      amount: getNum("Amount"),
      quoteSent: getStr("Quote Sent"),
      status: getStr("Status"),
      currentStatus: getStr("Current Status"),
    });
  });

  return { rows, skippedRows };
}
