import ExcelJS from "exceljs";
import { requireUser, isBackOffice } from "@/lib/rbac";
import { getAvailableStockByProduct } from "@/lib/pricing";
import { RESERVATION_STATUS_LABEL } from "@/lib/reservations";
import { listReservations, customerOf } from "../data";

// The Head and the Coordinator: what to hold in the warehouse - each
// reservation (reserved and awaiting approval) and the total per item.
export async function GET() {
  const user = await requireUser();
  if (!isBackOffice(user)) return new Response("Not allowed", { status: 403 });
  const [rows, gross] = await Promise.all([listReservations(), getAvailableStockByProduct({ gross: true })]);
  rows.sort((a, b) => (a.status === b.status ? a.product.model.localeCompare(b.product.model) : a.status === "APPROVED" ? -1 : 1));
  const wb = new ExcelJS.Workbook();
  const head = (ws: ExcelJS.Worksheet, cols: string[]) => {
    const r = ws.addRow(cols);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } }));
  };
  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "");
  const today = new Date().toISOString().slice(0, 10);

  const s = wb.addWorksheet("Reservations");
  s.addRow([`Stock reservations as at ${today}`]).font = { bold: true, size: 12 };
  s.addRow([]);
  head(s, ["Status", "Product", "Code", "Category", "Qty", "Customer", "Deal", "Sales person", "Requested on", "Approved on", "Hold until", "Reason", "Head's note"]);
  for (const r of rows) {
    s.addRow([RESERVATION_STATUS_LABEL[r.status], r.product.model, r.product.code, r.product.category, r.qty, customerOf(r), r.deal.title, r.deal.owner.name, d(r.requestedAt), d(r.decidedAt), d(r.expiresAt), r.reason ?? "", r.decisionNote ?? ""]);
  }
  [18, 26, 16, 14, 7, 28, 30, 18, 13, 13, 13, 34, 30].forEach((w, i) => (s.getColumn(i + 1).width = w));

  // Per item: reserved, awaiting approval, physical stock.
  const per = new Map<string, { model: string; code: string; reserved: number; asked: number; pid: string }>();
  for (const r of rows) {
    const pid = r.productId;
    const p = per.get(pid) ?? { model: r.product.model, code: r.product.code, reserved: 0, asked: 0, pid };
    if (r.status === "APPROVED") p.reserved += r.qty;
    else p.asked += r.qty;
    per.set(pid, p);
  }
  const t = wb.addWorksheet("By item");
  head(t, ["Product", "Code", "Reserved", "Awaiting approval", "In stock", "Free after reservations"]);
  for (const p of [...per.values()].sort((a, b) => a.model.localeCompare(b.model))) {
    const stock = gross.get(p.pid) ?? 0;
    t.addRow([p.model, p.code, p.reserved, p.asked, stock, Math.max(0, stock - p.reserved)]);
  }
  [26, 16, 11, 18, 11, 22].forEach((w, i) => (t.getColumn(i + 1).width = w));

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="stock-reservations-${today}.xlsx"`,
    },
  });
}
