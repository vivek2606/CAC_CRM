import ExcelJS from "exceljs";
import { requireUser } from "@/lib/rbac";

// Blank sheet for uploading the products billed when marking a deal Won.
export async function GET() {
  await requireUser();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products billed");
  ws.addRow(["Product Code", "Model", "Qty", "Rate"]);
  ws.getRow(1).font = { bold: true };
  ws.addRow(["1201231677", "MIDEA CAC - example model", 2, 450000]);
  ws.addRow(["", "Model only is fine when the code isn't known", 1, 1250000]);
  ws.getColumn(4).numFmt = "#,##0.00";
  ws.columns.forEach((c, i) => (c.width = [16, 44, 8, 16][i]));
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="products-billed-template.xlsx"',
    },
  });
}
