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
  const h = ws.addRow(["Sales person", "Target", "Achieved", "Shortfall / excess", "% Achieved", "Chart (each █ = 10% of target)"]);
  h.eachCell((c) => Object.assign(c, head));
  for (const x of [...r.rows, r.team]) {
    const n = ws.rowCount + 1;
    // A text bar that draws itself in any spreadsheet: one block per 10% of
    // target (capped at 20 = 200%).
    const blocks = x.pct == null ? 0 : Math.min(20, Math.round(x.pct / 10));
    const row = ws.addRow([
      x.name,
      x.target,
      x.achieved,
      { formula: `C${n}-B${n}` },
      { formula: `IF(B${n}>0,C${n}/B${n},"")`, result: x.pct == null ? "" : x.pct / 100 },
      { formula: `IF(B${n}>0,REPT("█",MIN(20,ROUND(C${n}/B${n}*10,0))),"")`, result: "█".repeat(blocks) },
    ]);
    row.getCell(6).font = { color: { argb: x.pct == null ? "FF94A3B8" : x.pct >= 100 ? "FF10B981" : x.pct >= 70 ? "FFF59E0B" : "FFF43F5E" } };
    row.getCell(2).numFmt = MONEY;
    row.getCell(3).numFmt = MONEY;
    row.getCell(4).numFmt = MONEY;
    row.getCell(5).numFmt = "0.0%";
    if (x.id === "team") row.font = { bold: true };
  }
  ws.columns = [{ width: 30 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 14 }, { width: 28 }];
  // In-cell data bars on Achieved and % Achieved (sales people, not the team row).
  const firstData = 5;
  const lastRep = firstData + r.rows.length - 1;
  if (r.rows.length) {
    ws.addConditionalFormatting({
      ref: `C${firstData}:C${lastRep}`,
      rules: [{ type: "dataBar", priority: 1, cfvo: [{ type: "min" }, { type: "max" }], color: { argb: "FF10B981" } } as ExcelJS.ConditionalFormattingRule],
    });
    ws.addConditionalFormatting({
      ref: `E${firstData}:E${lastRep}`,
      rules: [{ type: "dataBar", priority: 2, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 1.5 }], color: { argb: "FF6366F1" } } as ExcelJS.ConditionalFormattingRule],
    });
  }

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
  // % cells: green at 100%+, amber 70-99%, red under 70%.
  const lastCol = String.fromCharCode(64 + months.length + 3);
  const pctRef = `C4:${lastCol}${wm.rowCount}`;
  wm.addConditionalFormatting({
    ref: pctRef,
    rules: [
      { type: "expression", priority: 1, formulae: [`AND($B4="% Achieved",ISNUMBER(C4),C4>=1)`], style: { font: { color: { argb: "FF047857" }, bold: true }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD1FAE5" } } } },
      { type: "expression", priority: 2, formulae: [`AND($B4="% Achieved",ISNUMBER(C4),C4>=0.7,C4<1)`], style: { font: { color: { argb: "FFB45309" }, bold: true }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFEF3C7" } } } },
      { type: "expression", priority: 3, formulae: [`AND($B4="% Achieved",ISNUMBER(C4),C4<0.7)`], style: { font: { color: { argb: "FFBE123C" }, bold: true }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFE4E6" } } } },
    ],
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Target-vs-Achievement_${months[0].toISOString().slice(0, 7)}_to_${to.toISOString().slice(0, 7)}.xlsx"`,
    },
  });
}
