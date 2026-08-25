import ExcelJS from "exceljs";
import type { RawSalesRow } from "./sales-register";

const REQUIRED_COLUMNS = [
  "Txn No",
  "Doc Date",
  "Cust Code",
  "Cust Name",
  "Locn Name",
  "Category",
  "Sub-Category",
  "Item Code",
  "Item Name",
  "Qty",
  "Rate",
  "Net Amt",
  "Exchange Rate",
  "Salesmen",
];

export async function parseSalesRegisterBuffer(
  buffer: ArrayBuffer
): Promise<{ rows: RawSalesRow[]; skippedRows: number }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The uploaded file has no worksheets.");

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const idx = (name: string) => headers.indexOf(name);
  const missing = REQUIRED_COLUMNS.filter((c) => idx(c) === -1);
  if (missing.length > 0) {
    throw new Error(`Missing expected column(s): ${missing.join(", ")}`);
  }

  const rows: RawSalesRow[] = [];
  let skippedRows = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const txnNo = row.getCell(idx("Txn No")).value;
    if (typeof txnNo !== "number") {
      skippedRows++;
      return;
    }

    const getStr = (col: string): string | null => {
      const v = row.getCell(idx(col)).value;
      if (v == null) return null;
      if (typeof v === "object" && "result" in (v as object)) {
        return String((v as { result: unknown }).result ?? "").trim();
      }
      const s = String(v).trim();
      return s === "" ? null : s;
    };
    const getNum = (col: string): number => {
      const v = row.getCell(idx(col)).value;
      if (typeof v === "number") return v;
      if (v == null) return 0;
      const n = Number(v);
      return Number.isNaN(n) ? 0 : n;
    };
    const getDate = (col: string): Date => {
      const v = row.getCell(idx(col)).value;
      if (v instanceof Date) return v;
      return new Date(String(v));
    };

    rows.push({
      txnNo,
      docDate: getDate("Doc Date"),
      custCode: getStr("Cust Code") ?? "",
      custName: getStr("Cust Name") ?? "",
      locnName: getStr("Locn Name"),
      category: getStr("Category") ?? "",
      subCategory: getStr("Sub-Category"),
      itemCode: getStr("Item Code") ?? "",
      itemName: getStr("Item Name") ?? "",
      qty: getNum("Qty"),
      rate: getNum("Rate"),
      netAmt: getNum("Net Amt"),
      exchangeRate: getNum("Exchange Rate"),
      salesman: getStr("Salesmen") ?? "",
    });
  });

  return { rows, skippedRows };
}
