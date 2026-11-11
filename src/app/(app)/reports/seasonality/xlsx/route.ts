import ExcelJS from "exceljs";
import { requireBackOffice } from "@/lib/rbac";
import { getSeasonality, MONTHS_SHORT } from "@/lib/seasonality";

// The seasonality guide as Excel: each month's share by category, and each
// category's months year by year.
export async function GET(request: Request) {
  await requireBackOffice();
  const metric = new URL(request.url).searchParams.get("metric") === "units" ? "units" : "value";
  const s = await getSeasonality(metric);
  const wb = new ExcelJS.Workbook();
  const head = (ws: ExcelJS.Worksheet, cols: string[]) => {
    const r = ws.addRow(cols);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } }));
  };
  const sh = wb.addWorksheet("Share of year");
  head(sh, ["Category", ...MONTHS_SHORT, metric === "units" ? "Average year (units)" : "Average year (NGN)", "Peak months", "Order by"]);
  for (const r of s.rows) {
    const row = sh.addRow([r.category, ...r.share.map((v) => v / 100), Math.round(r.yearly), r.peaks.map((m) => MONTHS_SHORT[m]).join(", "), r.orderBy.map((m) => MONTHS_SHORT[m]).join(", ")]);
    for (let c = 2; c <= 13; c++) row.getCell(c).numFmt = "0.0%";
    row.getCell(14).numFmt = "#,##0";
  }
  sh.getColumn(1).width = 24;
  const by = wb.addWorksheet("By year");
  head(by, ["Category", "Year", ...MONTHS_SHORT, "Total"]);
  for (const r of s.rows)
    for (const y of s.years) {
      const row = by.addRow([r.category, y, ...r.byYear[y].map((v) => Math.round(v)), Math.round(r.byYear[y].reduce((a, v) => a + v, 0))]);
      for (let c = 3; c <= 15; c++) row.getCell(c).numFmt = "#,##0";
    }
  by.getColumn(1).width = 24;
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="seasonality-${metric}.xlsx"` },
  });
}
