import ExcelJS from "exceljs";
import type { ModelPlan, PlanningWindow } from "@/lib/model-planning";

// The Midea ordering sheet: every model with sales in the two years (or
// stock / goods in transit / pending orders), its units month by month,
// the 3-month average, stock position and the quantity to order - the
// average and order quantity are formulas off the months and the "keep in
// stock" months cell, so changing that cell re-plans the whole order.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const col = (n: number) => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

export async function buildModelPlanningXlsx(plans: ModelPlan[], window: PlanningWindow, coverMonths: number): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Midea order plan", { views: [{ state: "frozen", xSplit: 1, ySplit: 5 }] });
  const { thisYear, last3 } = window;
  const lastYear = thisYear - 1;
  // Columns: Model | Category | Codes | last year Jan-Dec | this year Jan-Dec | totals | avg | stock...
  const FIRST_MONTH = 4;
  const monthCol = (year: number, m: number) => FIRST_MONTH + (year === lastYear ? 0 : 12) + m;
  const TOT_LAST = FIRST_MONTH + 24;
  const TOT_THIS = TOT_LAST + 1;
  const AVG = TOT_THIS + 1;
  const STOCK = AVG + 1;
  const TRANSIT = STOCK + 1;
  const ETA = TRANSIT + 1;
  const PAID = ETA + 1;
  const UNPAID = PAID + 1;
  const COVER = UNPAID + 1;
  const ORDER = COVER + 1;

  ws.getCell("A1").value = `Midea order plan - ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = "Keep in stock (months):";
  ws.getCell("A2").font = { bold: true };
  ws.getCell("B2").value = coverMonths;
  ws.getCell("B2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
  ws.getCell("B2").font = { bold: true };
  ws.getCell("C2").value = `Order = months x 3-month average (${window.avgLabel}) + paid pending orders - stock - in transit. Change B2 to re-plan. Units net of returns.`;
  ws.getCell("C2").font = { italic: true, color: { argb: "FF64748B" } };

  // Row 4: year bands; row 5: headings.
  const band = (from: number, to: number, text: string, argb: string) => {
    ws.mergeCells(4, from, 4, to);
    const c = ws.getCell(4, from);
    c.value = text;
    c.alignment = { horizontal: "center" };
    c.font = { bold: true, color: { argb: "FF1E3A6E" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  };
  band(monthCol(lastYear, 0), monthCol(lastYear, 11), `${lastYear} - units sold`, "FFF1F5F9");
  band(monthCol(thisYear, 0), monthCol(thisYear, 11), `${thisYear} - units sold`, "FFE0E7FF");
  band(AVG, ORDER, "Ordering", "FFFEF3C7");
  const heads: [number, string][] = [
    [1, "Model"],
    [2, "Category"],
    [3, "Codes"],
    ...MONTHS.map((m, i) => [monthCol(lastYear, i), m] as [number, string]),
    ...MONTHS.map((m, i) => [monthCol(thisYear, i), m] as [number, string]),
    [TOT_LAST, `Total ${lastYear}`],
    [TOT_THIS, `Total ${thisYear}`],
    [AVG, "3-month avg / month"],
    [STOCK, "Stock"],
    [TRANSIT, "In transit"],
    [ETA, "Earliest ETA"],
    [PAID, "Paid pending"],
    [UNPAID, "Unpaid pending"],
    [COVER, "Months of cover"],
    [ORDER, "Order qty"],
  ];
  const h = ws.getRow(5);
  for (const [c, t] of heads) {
    const cell = h.getCell(c);
    cell.value = t;
    cell.font = { bold: true };
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: c <= 3 ? "left" : "right" };
    cell.border = { bottom: { style: "thin" } };
  }
  h.height = 32;
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 22;
  for (let c = FIRST_MONTH; c <= ORDER; c++) ws.getColumn(c).width = c >= AVG ? 11 : 6.5;
  ws.getColumn(ETA).width = 12;

  const avgCells = (r: number) => last3.map((d) => `${col(monthCol(d.getUTCFullYear(), d.getUTCMonth()))}${r}`);
  let r = 6;
  for (const p of plans) {
    const row = ws.getRow(r);
    row.getCell(1).value = p.model;
    row.getCell(2).value = p.category;
    row.getCell(3).value = p.codes.join(", ");
    for (const y of p.years) y.months.forEach((n, m) => n && (row.getCell(monthCol(y.year, m)).value = n));
    row.getCell(TOT_LAST).value = { formula: `SUM(${col(monthCol(lastYear, 0))}${r}:${col(monthCol(lastYear, 11))}${r})` };
    row.getCell(TOT_THIS).value = { formula: `SUM(${col(monthCol(thisYear, 0))}${r}:${col(monthCol(thisYear, 11))}${r})` };
    row.getCell(AVG).value = { formula: `MAX(0,(${avgCells(r).join("+")})/3)` };
    row.getCell(AVG).numFmt = "0.0";
    row.getCell(STOCK).value = p.stock;
    row.getCell(TRANSIT).value = p.transit;
    if (p.eta) {
      row.getCell(ETA).value = p.eta;
      row.getCell(ETA).numFmt = "dd mmm yyyy";
    }
    row.getCell(PAID).value = p.paid;
    row.getCell(UNPAID).value = p.unpaid;
    const A = `${col(AVG)}${r}`;
    row.getCell(COVER).value = { formula: `IF(${A}>0,ROUND(MAX(0,${col(STOCK)}${r}-${col(PAID)}${r})/${A},1),"")` };
    row.getCell(ORDER).value = { formula: `MAX(0,ROUNDUP(${A}*$B$2+${col(PAID)}${r}-${col(STOCK)}${r}-${col(TRANSIT)}${r},0))` };
    row.getCell(ORDER).font = { bold: true };
    row.getCell(ORDER).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
    r++;
  }
  // Totals.
  const t = ws.getRow(r + 1);
  t.getCell(1).value = "Total";
  t.font = { bold: true };
  for (let c = FIRST_MONTH; c <= ORDER; c++) {
    if (c === ETA || c === COVER) continue;
    t.getCell(c).value = { formula: `SUM(${col(c)}6:${col(c)}${r - 1})` };
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
