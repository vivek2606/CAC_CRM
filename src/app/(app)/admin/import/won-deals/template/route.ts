import ExcelJS from "exceljs";
import { requireHead } from "@/lib/rbac";
import { WON_UPDATE_TEMPLATE_HEADERS } from "@/lib/import/parse-won-deal-updates";

// Blank sheet for the won deals update, with an example invoice of two products.
export async function GET() {
  await requireHead();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Won deals");
  ws.addRow(WON_UPDATE_TEMPLATE_HEADERS);
  ws.getRow(1).font = { bold: true };
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  ws.addRow([d("2026-08-03"), d("2026-08-20"), d("2026-09-12"), "2026091077", "C00123", "Sakuragi", "1201231564SN", 2, 1000000, "Celinah Oluwamayo Ojo"]);
  ws.addRow([d("2026-08-03"), d("2026-08-20"), d("2026-09-12"), "2026091077", "C00123", "Sakuragi", "1201231565SN", 1, 450000, "Celinah Oluwamayo Ojo"]);
  for (const c of [1, 2, 3]) ws.getColumn(c).numFmt = "dd/mm/yyyy";
  ws.getColumn(9).numFmt = "#,##0.00";
  ws.columns.forEach((c, i) => (c.width = [13, 16, 13, 14, 15, 11, 18, 10, 14, 26][i]));
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="won-deals-update-template.xlsx"',
    },
  });
}
