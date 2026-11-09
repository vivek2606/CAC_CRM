import ExcelJS from "exceljs";
import type { ReviewPack } from "@/lib/review-pack";

// The monthly review pack as an Excel workbook: a Summary sheet, then one
// sheet each for people, wins, losses.
export async function buildReviewPackXlsx(p: ReviewPack, companyName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = companyName;
  const money = "#,##0";
  const head = (ws: ExcelJS.Worksheet, cols: string[]) => {
    const r = ws.addRow(cols);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } }));
  };
  const title = `${p.scope.kind === "division" ? "Division" : p.scope.name} - monthly review, ${p.monthLabel}`;
  const pctOf = (n: number | null) => (n == null ? "" : n / 100);

  const s = wb.addWorksheet("Summary");
  s.addRow([companyName]).font = { bold: true, size: 13 };
  s.addRow([title]).font = { bold: true, size: 12, color: { argb: "FF1E4F9C" } };
  s.addRow([]);
  head(s, ["Measure", "Value"]);
  const rows: [string, number | string, string?][] = [
    ["Target (month)", p.summary.target, money],
    ["Achieved (month)", p.summary.achieved, money],
    ["Achievement %", pctOf(p.summary.pct), "0%"],
    ["Same month last year", p.summary.lastYear, money],
    ["vs last year", pctOf(p.summary.vsLastYearPct), "+0%;-0%"],
    ["Target (year to date)", p.summary.ytdTarget, money],
    ["Achieved (year to date)", p.summary.ytdAchieved, money],
    ["YTD achievement %", pctOf(p.summary.ytdPct), "0%"],
    ["Leads created", p.funnel.leads],
    ["- became deals", p.funnel.deals],
    ["- quoted", p.funnel.quoted],
    ["- won", p.funnel.won],
    ...(p.forecast ? ([["Forecast on the 1st (weighted)", p.forecast.forecast, money], ["Won from that forecast", p.forecast.won, money], ["Forecast accuracy", pctOf(p.forecast.pct), "0%"]] as [string, number | string, string][]) : []),
    ...(p.service
      ? ([
          ["Complaints registered", p.service.registered],
          ["Complaints resolved", p.service.resolved],
          ["Resolved within service level", pctOf(p.service.slaResolvePct), "0%"],
          ["First-time fix", pctOf(p.service.firstTimeFixPct), "0%"],
          ["Installations commissioned", p.service.installsCommissioned],
          ["Service billed", p.service.billed, money],
        ] as [string, number | string, string?][])
      : []),
  ];
  for (const [k, v, fmt] of rows) {
    const r = s.addRow([k, v]);
    if (fmt) r.getCell(2).numFmt = fmt;
  }
  s.getColumn(1).width = 34;
  s.getColumn(2).width = 18;

  const ppl = wb.addWorksheet("People");
  head(ppl, ["Sales person", "Target", "Achieved", "Achieved %", "Won deals", "Win rate %", "Open pipeline", "New leads", "Converted", "Calls", "Meetings", "Site visits", "WhatsApp", "Quotes issued"]);
  for (const r of p.people) {
    const row = ppl.addRow([r.name, r.target, r.achieved, r.target ? r.achieved / r.target : "", r.wonCount, r.winRate == null ? "" : r.winRate / 100, r.openValue, r.newLeads, r.converted, r.calls, r.meetings, r.visits, r.whatsapp, r.quotes]);
    [2, 3, 7].forEach((i) => (row.getCell(i).numFmt = money));
    [4, 6].forEach((i) => (row.getCell(i).numFmt = "0%"));
  }
  ppl.columns.forEach((c, i) => (c.width = i === 0 ? 24 : 13));

  const w = wb.addWorksheet("Won");
  head(w, ["Deal", "Customer", "Sales person", "Date", "Value"]);
  for (const d of p.won) w.addRow([d.title, d.customer, d.owner, d.date, d.value]).getCell(5).numFmt = money;
  [40, 30, 20, 12, 15].forEach((x, i) => (w.getColumn(i + 1).width = x));

  const l = wb.addWorksheet("Lost");
  head(l, ["Deal", "Customer", "Sales person", "Value", "Reason", "Lost to", "We were higher by"]);
  for (const d of p.lost) {
    const r = l.addRow([d.title, d.customer, d.owner, d.value, d.reason, d.brand, d.gapPct == null ? "" : d.gapPct / 100]);
    r.getCell(4).numFmt = money;
    r.getCell(7).numFmt = "0%";
  }
  [40, 30, 20, 15, 30, 16, 16].forEach((x, i) => (l.getColumn(i + 1).width = x));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
