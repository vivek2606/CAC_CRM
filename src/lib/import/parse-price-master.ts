import ExcelJS from "exceljs";

export type RawPriceMasterRow = {
  productCode: string;
  brand: string | null;
  category: string;
  subCategory: string;
  model: string;
  capacityKw: number | null;
  dealerPrice: number;
};

const REQUIRED_COLUMNS = ["Product Code", "Category", "Sub-Category", "Model", "Dealer Price"];

export async function parsePriceMasterBuffer(
  buffer: ArrayBuffer
): Promise<{ rows: RawPriceMasterRow[]; skippedRows: number }> {
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
  const brandIdx = idx("Brand");
  const capacityIdx = idx("Capacity (kW)");

  const rows: RawPriceMasterRow[] = [];
  let skippedRows = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const getStr = (colIndex: number): string | null => {
      if (colIndex === -1) return null;
      const v = row.getCell(colIndex).value;
      if (v == null) return null;
      if (typeof v === "object" && "result" in (v as object)) {
        const r = (v as { result: unknown }).result;
        return r == null ? null : String(r).trim() || null;
      }
      const s = String(v).trim();
      return s === "" ? null : s;
    };
    const getNum = (colIndex: number): number | null => {
      if (colIndex === -1) return null;
      const v = row.getCell(colIndex).value;
      if (typeof v === "number") return v;
      if (v == null) return null;
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    };

    const productCode = getStr(idx("Product Code"));
    const category = getStr(idx("Category"));
    const subCategory = getStr(idx("Sub-Category"));
    const model = getStr(idx("Model"));
    const dealerPrice = getNum(idx("Dealer Price"));
    if (!productCode || !category || !subCategory || !model || dealerPrice == null) {
      skippedRows++;
      return;
    }

    rows.push({
      productCode,
      brand: getStr(brandIdx),
      category,
      subCategory,
      model,
      capacityKw: getNum(capacityIdx),
      dealerPrice,
    });
  });

  return { rows, skippedRows };
}
