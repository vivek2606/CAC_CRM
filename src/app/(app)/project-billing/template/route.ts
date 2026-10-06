import ExcelJS from "exceljs";
import { requireBackOffice } from "@/lib/rbac";
import { PROJECT_BILLING_TEMPLATE_HEADERS } from "@/lib/import/parse-project-billing";

// Blank sheet for the bulk Project & Service billing upload, with examples.
export async function GET() {
  await requireBackOffice();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Project & Service");
  ws.addRow(PROJECT_BILLING_TEMPLATE_HEADERS);
  ws.getRow(1).font = { bold: true };
  ws.addRow([new Date(), "2026091001", "RCCG, Champions Cathedral", "Celinah Oluwamayo Ojo", "Project", "Installation project", 12500000]);
  ws.addRow([new Date(), "2026091002", "CAC SERVICE CUSTOMER", "Okunade Sikiru", "Service", "Service charge", 850000]);
  ws.getColumn(1).numFmt = "dd/mm/yyyy";
  ws.getColumn(7).numFmt = "#,##0.00";
  ws.columns.forEach((c, i) => (c.width = [14, 14, 32, 26, 10, 30, 16][i]));
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="project-service-billing-template.xlsx"',
    },
  });
}
