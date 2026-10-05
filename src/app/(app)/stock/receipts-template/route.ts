import ExcelJS from "exceljs";
import { requireHead } from "@/lib/rbac";
import { STOCK_RECEIPT_TEMPLATE_HEADERS } from "@/lib/import/parse-stock-receipts";

// Blank sheet for the bulk "fresh units received" upload, with one example
// row showing the expected formats.
export async function GET() {
  await requireHead();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Stock received");
  ws.addRow(STOCK_RECEIPT_TEMPLATE_HEADERS);
  ws.getRow(1).font = { bold: true };
  ws.addRow(["1201231677", "MIDEA CAC - example model", "Small Duct", 10, new Date(), 950000, "Container ref. (optional)"]);
  ws.getColumn(5).numFmt = "dd/mm/yyyy";
  ws.columns.forEach((c, i) => (c.width = [16, 40, 16, 10, 15, 16, 28][i]));
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="stock-received-template.xlsx"',
    },
  });
}
