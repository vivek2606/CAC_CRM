import ExcelJS from "exceljs";
import { requireHead } from "@/lib/rbac";
import { IN_TRANSIT_TEMPLATE_HEADERS } from "@/lib/import/parse-in-transit";

// Blank sheet for the bulk in-transit upload, with one example row.
export async function GET() {
  await requireHead();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("In transit");
  ws.addRow(IN_TRANSIT_TEMPLATE_HEADERS);
  ws.getRow(1).font = { bold: true };
  const eta = new Date();
  eta.setUTCDate(eta.getUTCDate() + 60);
  ws.addRow(["1201231677", "MIDEA CAC - example model", "Small Duct", 20, eta, new Date(), "PI-2026-014 / container no.", ""]);
  ws.getColumn(5).numFmt = "dd/mm/yyyy";
  ws.getColumn(6).numFmt = "dd/mm/yyyy";
  ws.columns.forEach((c, i) => (c.width = [16, 40, 16, 10, 14, 14, 26, 24][i]));
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="in-transit-template.xlsx"',
    },
  });
}
