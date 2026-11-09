import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { SALES_TITLE_IN } from "@/lib/team-titles";
import { getUsdSales } from "@/lib/usd-sales";

// Sales in USD as Excel: months, sales people, categories.
export async function GET(request: Request) {
  await requireBackOffice();
  const raw = new URL(request.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(raw)) return new Response("Pick a month.", { status: 400 });
  const reps = await prisma.user.findMany({ where: { isActive: true, title: SALES_TITLE_IN }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const u = await getUsdSales(raw, reps);
  const y = Number(raw.slice(0, 4));
  const wb = new ExcelJS.Workbook();
  const usd = '"$"#,##0';
  const head = (ws: ExcelJS.Worksheet, cols: string[]) => {
    const r = ws.addRow(cols);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } }));
  };
  const ratio = (a: number, b: number) => (b > 0 ? a / b : "");
  const change = (a: number, b: number) => (b > 0 ? (a - b) / b : "");
  const fmt = (row: ExcelJS.Row, money: number[], pcts: number[]) => {
    money.forEach((i) => (row.getCell(i).numFmt = usd));
    pcts.forEach((i) => (row.getCell(i).numFmt = "0%"));
    return row;
  };

  const m = wb.addWorksheet("Months");
  m.addRow([`Sales in USD - 12 months to ${u.monthLabel}`]).font = { bold: true, size: 12 };
  if (u.provisional.length) m.addRow([`Provisional (no rate entered, nearest month's rate used): ${u.provisional.length} month(s) from ${u.provisional[0]} to ${u.provisional.at(-1)}`]).font = { italic: true, color: { argb: "FFB45309" } };
  m.addRow([]);
  head(m, ["Month", "Rate (₦/$)", "Target $", "Sales $", "Achieved", "Last yr rate", "Last yr target $", "Last yr sales $", "Last yr achieved", "vs last year"]);
  for (const r of u.trend) {
    fmt(m.addRow([r.label, r.rate ?? "", r.target, r.sales, ratio(r.sales, r.target), r.lyRate ?? "", r.lyTarget, r.lySales, ratio(r.lySales, r.lyTarget), change(r.sales, r.lySales)]), [3, 4, 7, 8], [5, 9, 10]);
  }
  fmt(m.addRow([`YTD ${y}`, "", u.ytd.target, u.ytd.sales, ratio(u.ytd.sales, u.ytd.target), "", u.ytd.lyTarget, u.ytd.lySales, ratio(u.ytd.lySales, u.ytd.lyTarget), change(u.ytd.sales, u.ytd.lySales)]), [3, 4, 7, 8], [5, 9, 10]).font = { bold: true };
  m.columns.forEach((c, i) => (c.width = i === 0 ? 12 : 15));

  const p = wb.addWorksheet("Sales people");
  head(p, ["Sales person", `${u.monthLabel} target $`, "Sales $", "Achieved", "Last yr $", "vs last yr", "YTD target $", "YTD sales $", "YTD achieved", `YTD ${y - 1} $`, "YTD vs last yr"]);
  for (const r of u.people) {
    fmt(p.addRow([r.name, r.target, r.sales, ratio(r.sales, r.target), r.ly, change(r.sales, r.ly), r.ytdTarget, r.ytdSales, ratio(r.ytdSales, r.ytdTarget), r.ytdLy, change(r.ytdSales, r.ytdLy)]), [2, 3, 5, 7, 8, 10], [4, 6, 9, 11]);
  }
  p.columns.forEach((c, i) => (c.width = i === 0 ? 24 : 15));

  const c = wb.addWorksheet("Categories");
  head(c, ["Category", `${u.monthLabel} $`, `Same month ${y - 1} $`, "Change", `YTD ${y} $`, `YTD ${y - 1} $`, "Change", "Share of YTD"]);
  const tot = u.categories.reduce((t, x) => t + x.ytd, 0);
  for (const x of u.categories) fmt(c.addRow([x.category, x.month, x.monthLy, change(x.month, x.monthLy), x.ytd, x.ytdLy, change(x.ytd, x.ytdLy), ratio(x.ytd, tot)]), [2, 3, 5, 6], [4, 7, 8]);
  c.columns.forEach((col, i) => (col.width = i === 0 ? 24 : 16));

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="sales-in-usd-${raw}.xlsx"` },
  });
}
