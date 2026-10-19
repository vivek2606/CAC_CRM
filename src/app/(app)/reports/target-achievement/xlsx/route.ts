import ExcelJS from "exceljs";
import { requireBackOffice } from "@/lib/rbac";
import { getTargetAchievement, rangeFrom, periodLabel, achievementPct } from "@/lib/target-achievement";

// Target vs achievement as an Excel file: a summary sheet and a month-by-
// month sheet, with live % formulas.
export async function GET(request: Request) {
  await requireBackOffice();
  const url = new URL(request.url);
  const { from, to, months } = rangeFrom({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  const r = await getTargetAchievement(from, to, months);
  const wb = new ExcelJS.Workbook();
  const MONEY = "#,##0.00";
  const head = { font: { bold: true, color: { argb: "FF1E3A8A" } }, fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFE0E7FF" } } };

  const ws = wb.addWorksheet("Summary");
  ws.addRow([`Target vs Achievement - ${periodLabel(r)}`]).font = { bold: true, size: 14 };
  ws.addRow(["Achieved = won deals (by invoice date) + project billing, excl. VAT"]).font = { italic: true, color: { argb: "FF64748B" } };
  ws.addRow([]);
  const h = ws.addRow(["Sales person", "Target", "Achieved", "Shortfall / excess", "% Achieved"]);
  h.eachCell((c) => Object.assign(c, head));
  for (const x of [...r.rows, r.team]) {
    const n = ws.rowCount + 1;
    const row = ws.addRow([x.name, x.target, x.achieved, { formula: `C${n}-B${n}` }, { formula: `IF(B${n}>0,C${n}/B${n},"")`, result: x.pct == null ? "" : x.pct / 100 }]);
    row.getCell(2).numFmt = MONEY;
    row.getCell(3).numFmt = MONEY;
    row.getCell(4).numFmt = MONEY;
    row.getCell(5).numFmt = "0.0%";
    if (x.id === "team") row.font = { bold: true };
  }
  ws.columns = [{ width: 30 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 14 }];

  const wm = wb.addWorksheet("Month by month");
  wm.addRow([`Target vs Achievement by month - ${periodLabel(r)}`]).font = { bold: true, size: 14 };
  wm.addRow([]);
  const labels = months.map((m) => m.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }));
  const hm = wm.addRow(["Sales person", "", ...labels, "Total"]);
  hm.eachCell((c) => Object.assign(c, head));
  for (const x of [...r.rows, r.team]) {
    const lines: [string, (i: number) => number | string][] = [
      ["Target", (i) => x.months[i].target],
      ["Achieved", (i) => x.months[i].achieved],
      ["% Achieved", (i) => {
        const p = achievementPct(x.months[i].achieved, x.months[i].target);
        return p == null ? "" : p / 100;
      }],
    ];
    lines.forEach(([what, val], li) => {
      const total = what === "Target" ? x.target : what === "Achieved" ? x.achieved : x.pct == null ? "" : x.pct / 100;
      const row = wm.addRow([li === 0 ? x.name : "", what, ...months.map((_, i) => val(i)), total]);
      for (let c = 3; c <= months.length + 3; c++) row.getCell(c).numFmt = what === "% Achieved" ? "0.0%" : MONEY;
      if (x.id === "team" || li === 0) row.getCell(1).font = { bold: true };
      if (what === "% Achieved") row.font = { ...(row.font ?? {}), italic: true };
    });
  }
  wm.columns = [{ width: 28 }, { width: 12 }, ...months.map(() => ({ width: 16 })), { width: 18 }];

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Target-vs-Achievement_${months[0].toISOString().slice(0, 7)}_to_${to.toISOString().slice(0, 7)}.xlsx"`,
    },
  });
}
