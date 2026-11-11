import ExcelJS from "exceljs";
import { requireBackOffice } from "@/lib/rbac";
import { getStockToSell, getIncoming } from "@/lib/stock-selling";

// Stock to sell as Excel (Head and Coordinator): slow / aged models, their
// past buyers, and stock arriving with who's waiting.
export async function GET() {
  await requireBackOffice();
  const [rows, incoming] = await Promise.all([getStockToSell(null), getIncoming(null)]);
  const wb = new ExcelJS.Workbook();
  const head = (ws: ExcelJS.Worksheet, cols: string[]) => {
    const r = ws.addRow(cols);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } }));
  };
  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "");

  const s = wb.addWorksheet("Slow and aged");
  head(s, ["Model", "Code", "Category", "Free stock", "Oldest units (days)", "Last sold", "Sold a month (6 mo.)", "Months of stock", "Slow", "Aged", "Past buyers"]);
  for (const r of rows)
    s.addRow([r.model, r.code, r.category, r.free, r.oldestDays == null ? "" : `${r.ageIsAtLeast ? ">" : ""}${r.oldestDays}`, d(r.lastSale), Math.round(r.monthlyRate * 10) / 10, r.coverMonths == null ? "no sales" : Math.round(r.coverMonths * 10) / 10, r.slow ? "Yes" : "", r.aged ? "Yes" : "", r.buyers.length]);
  [26, 16, 14, 10, 16, 12, 16, 14, 7, 7, 11].forEach((w, i) => (s.getColumn(i + 1).width = w));

  const b = wb.addWorksheet("Past buyers");
  head(b, ["Model", "Customer", "Sales person", "Units bought (2 yrs)", "Last bought", "Last rate (excl. VAT)", "Phone"]);
  for (const r of rows) for (const x of r.buyers) b.addRow([r.model, x.name, x.ownerName, x.qty, d(x.lastDate), Math.round(x.lastRate), x.phone ?? ""]).getCell(6).numFmt = "#,##0";
  [26, 30, 20, 16, 12, 18, 18].forEach((w, i) => (b.getColumn(i + 1).width = w));

  const w = wb.addWorksheet("Arriving and waiting");
  head(w, ["Model", "Code", "Units", "Status", "Date", "Reference", "Waiting customer", "Why", "Units wanted", "Sales person"]);
  for (const i of incoming) {
    const base = [i.model, i.code, i.qty, i.arrived ? "Arrived" : "In transit", d(i.date), i.reference ?? ""];
    if (!i.waiting.length) w.addRow([...base, "", "", "", ""]);
    for (const x of i.waiting) w.addRow([...base, x.customer, x.kind === "pending" ? `Pending order${x.paid ? " (paid)" : ""}` : "Lost - no stock", x.qty ?? "", x.ownerName]);
  }
  [26, 16, 8, 11, 12, 18, 30, 20, 12, 20].forEach((x, i) => (w.getColumn(i + 1).width = x));

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const today = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="stock-to-sell-${today}.xlsx"` },
  });
}
