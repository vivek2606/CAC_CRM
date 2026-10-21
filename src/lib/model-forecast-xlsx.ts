import ExcelJS from "exceljs";
import type { ForecastSettings, ModelForecast } from "@/lib/model-forecast";
import { monthName } from "@/lib/model-forecast";

// The Midea order plan in Excel. Sheet 1, model by model: stock now, goods
// in transit, paid pending orders, projected sales month by month until the
// order lands, the stock left then, projected sales for the months the
// order covers and the quantity to order - next year's months, the balances
// and the order are formulas off the growth cells (B2 drivers / B3 others)
// and each model's "Growth driver" Yes/No, so they can be changed in place.
// Sheet 2: units sold month by month, this year and the last few.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const col = (n: number) => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};
const fill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

export async function buildModelForecastXlsx(rows: ModelForecast[], s: ForecastSettings): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Midea order plan", { views: [{ state: "frozen", xSplit: 1, ySplit: 6 }] });
  const sample = rows[0];
  const nBefore = sample?.before.length ?? 0;
  const nAfter = sample?.after.length ?? 0;
  const lastBefore = sample?.before[nBefore - 1]?.label.replace(" (rest)", "") ?? "";
  const afterSpan = sample ? `${sample.after[0].label}-${sample.after[nAfter - 1].label}` : "";

  ws.getCell("A1").value = `Midea order plan - ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}: order placed now lands ${monthName(s.arrival)}, to last ${s.coverMonths} months`;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = "Growth next year - growth drivers:";
  ws.getCell("B2").value = s.driverGrowthPct / 100;
  ws.getCell("A3").value = "Growth next year - other models:";
  ws.getCell("B3").value = s.otherGrowthPct / 100;
  for (const a of ["B2", "B3"]) {
    ws.getCell(a).numFmt = "0%";
    ws.getCell(a).fill = fill("FFFEF3C7");
    ws.getCell(a).font = { bold: true };
  }
  for (const a of ["A2", "A3"]) ws.getCell(a).font = { bold: true };
  ws.getCell("C2").value = `Projected sales = the same month's average over the last ${s.yearsBack} years the model sold in; next year's months + the growth %. Growth drivers: Atom-C duct & cassette, Floor Standing, VRF (change Yes/No per model).`;
  ws.getCell("C3").value = `Stock at landing = stock + in transit - paid pending - sales until then. Order = sales ${afterSpan} - stock at landing (if any). Units net of returns.`;
  for (const a of ["C2", "C3"]) ws.getCell(a).font = { italic: true, color: { argb: "FF64748B" } };

  // Columns.
  const C = { model: 1, category: 2, codes: 3, driver: 4, stock: 5, transit: 6, eta: 7, paid: 8, unpaid: 9 };
  const B0 = 10; // first "before" month
  const SOLD = B0 + nBefore;
  const ATARR = SOLD + 1;
  const A0 = ATARR + 1;
  const NEED = A0 + nAfter;
  const ORDER = NEED + 1;
  const SHORT = ORDER + 1;
  const band = (from: number, to: number, text: string, argb: string) => {
    if (to > from) ws.mergeCells(5, from, 5, to);
    const c = ws.getCell(5, from);
    c.value = text;
    c.alignment = { horizontal: "center" };
    c.font = { bold: true, color: { argb: "FF1E3A6E" } };
    c.fill = fill(argb);
  };
  band(C.stock, C.unpaid, "Stock position now", "FFF1F5F9");
  band(B0, ATARR, `Projected sales until ${lastBefore} and stock left`, "FFE0E7FF");
  band(A0, SHORT, `The order: lands ${monthName(s.arrival)}, covers ${afterSpan}`, "FFFEF3C7");
  const heads: [number, string][] = [
    [C.model, "Model"],
    [C.category, "Category"],
    [C.codes, "Codes"],
    [C.driver, "Growth driver"],
    [C.stock, "Stock now"],
    [C.transit, "In transit"],
    [C.eta, "Earliest ETA"],
    [C.paid, "Paid pending"],
    [C.unpaid, "Unpaid pending (info)"],
    ...(sample?.before.map((m, i) => [B0 + i, m.label] as [number, string]) ?? []),
    [SOLD, `Sales until ${lastBefore}`],
    [ATARR, `Stock at landing (start ${sample?.after[0]?.label ?? ""})`],
    ...(sample?.after.map((m, i) => [A0 + i, m.label] as [number, string]) ?? []),
    [NEED, `Sales ${afterSpan}`],
    [ORDER, "ORDER NOW"],
    [SHORT, "Short before landing"],
  ];
  const h = ws.getRow(6);
  for (const [c, t] of heads) {
    const cell = h.getCell(c);
    cell.value = t;
    cell.font = { bold: true };
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: c <= C.driver ? "left" : "right" };
    cell.border = { bottom: { style: "thin" } };
  }
  h.height = 44;
  ws.getColumn(C.model).width = 28;
  ws.getColumn(C.category).width = 13;
  ws.getColumn(C.codes).width = 20;
  ws.getColumn(C.driver).width = 8;
  for (let c = C.stock; c <= SHORT; c++) ws.getColumn(c).width = c === C.eta ? 11 : 9;

  let r = 7;
  for (const f of rows) {
    const row = ws.getRow(r);
    row.getCell(C.model).value = f.model;
    row.getCell(C.category).value = f.category;
    row.getCell(C.codes).value = f.codes.join(", ");
    row.getCell(C.driver).value = f.driver ? "Yes" : "No";
    row.getCell(C.driver).fill = fill("FFFEF3C7");
    row.getCell(C.stock).value = f.stock;
    row.getCell(C.transit).value = f.transit;
    if (f.eta) {
      row.getCell(C.eta).value = f.eta;
      row.getCell(C.eta).numFmt = "dd mmm yy";
    }
    row.getCell(C.paid).value = f.paid;
    row.getCell(C.unpaid).value = f.unpaid;
    const monthCell = (c: number, m: ModelForecast["before"][number]) => {
      const cell = row.getCell(c);
      cell.value = m.growth ? { formula: `ROUND(${m.base}*(1+IF($${col(C.driver)}${r}="Yes",$B$2,$B$3)),1)` } : m.base;
      cell.numFmt = "0.0";
    };
    f.before.forEach((m, i) => monthCell(B0 + i, m));
    f.after.forEach((m, i) => monthCell(A0 + i, m));
    const sold = nBefore ? `SUM(${col(B0)}${r}:${col(B0 + nBefore - 1)}${r})` : "0";
    row.getCell(SOLD).value = { formula: sold };
    row.getCell(ATARR).value = { formula: `${col(C.stock)}${r}+${col(C.transit)}${r}-${col(C.paid)}${r}-${col(SOLD)}${r}` };
    row.getCell(NEED).value = { formula: `SUM(${col(A0)}${r}:${col(A0 + nAfter - 1)}${r})` };
    row.getCell(ORDER).value = { formula: `MAX(0,ROUNDUP(${col(NEED)}${r}-MAX(0,${col(ATARR)}${r}),0))` };
    row.getCell(SHORT).value = { formula: `MAX(0,ROUNDUP(-${col(ATARR)}${r},0))` };
    for (const c of [SOLD, ATARR, NEED]) row.getCell(c).numFmt = "0.0";
    row.getCell(ORDER).font = { bold: true };
    row.getCell(ORDER).fill = fill("FFFEF9C3");
    row.getCell(SHORT).font = { color: { argb: "FFB91C1C" } };
    r++;
  }
  const t = ws.getRow(r + 1);
  t.getCell(C.model).value = "Total";
  t.font = { bold: true };
  for (let c = C.stock; c <= SHORT; c++) {
    if (c === C.eta) continue;
    t.getCell(c).value = { formula: `SUM(${col(c)}7:${col(c)}${r - 1})` };
    t.getCell(c).numFmt = "#,##0";
  }

  // Sheet 2: the sales the projections come from.
  const hs = wb.addWorksheet("Sales history", { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });
  const years = sample?.history.map((x) => x.year).sort((a, b) => a - b) ?? [];
  const head1 = hs.getRow(1);
  const head2 = hs.getRow(2);
  head2.getCell(1).value = "Model";
  head2.getCell(2).value = "Codes";
  years.forEach((y, yi) => {
    const start = 3 + yi * 13;
    hs.mergeCells(1, start, 1, start + 12);
    head1.getCell(start).value = String(y);
    head1.getCell(start).alignment = { horizontal: "center" };
    head1.getCell(start).fill = fill(yi % 2 ? "FFE0E7FF" : "FFF1F5F9");
    MONTHS.forEach((m, i) => (head2.getCell(start + i).value = m));
    head2.getCell(start + 12).value = `Total ${y}`;
  });
  head1.font = { bold: true };
  head2.font = { bold: true };
  hs.getColumn(1).width = 28;
  hs.getColumn(2).width = 20;
  rows.forEach((f, i) => {
    const row = hs.getRow(3 + i);
    row.getCell(1).value = f.model;
    row.getCell(2).value = f.codes.join(", ");
    years.forEach((y, yi) => {
      const start = 3 + yi * 13;
      const h1 = f.history.find((x) => x.year === y);
      h1?.months.forEach((n, m) => n && (row.getCell(start + m).value = n));
      row.getCell(start + 12).value = { formula: `SUM(${col(start)}${3 + i}:${col(start + 11)}${3 + i})` };
      row.getCell(start + 12).font = { bold: true };
    });
  });
  for (let c = 3; c <= 2 + years.length * 13; c++) hs.getColumn(c).width = 6;

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
