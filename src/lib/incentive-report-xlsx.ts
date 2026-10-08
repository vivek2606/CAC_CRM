import ExcelJS from "exceljs";
import type { IncentiveApproval, IncentiveSnapshot } from "@/lib/incentive-approval";

const when = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "");

// The monthly incentive report as an Excel workbook - same figures as the
// PDF statement. Totals are formulas so the sheet stays editable.
export async function buildIncentiveReportXlsx({
  monthLabel,
  companyName,
  approval,
  draft,
}: {
  monthLabel: string;
  companyName: string;
  approval: IncentiveApproval & { snapshot: IncentiveSnapshot };
  draft: boolean;
}): Promise<Buffer> {
  const snap = approval.snapshot;
  const wb = new ExcelJS.Workbook();
  wb.creator = companyName;
  const ws = wb.addWorksheet("Incentives", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const money = "#,##0.00";
  const bold = { bold: true };

  ws.addRow([companyName]).font = { bold: true, size: 13 };
  ws.addRow([`${draft ? "Sales Incentive Report (DRAFT - not yet approved)" : "Sales Incentive Statement"} - ${monthLabel}`]).font = { bold: true, size: 12, color: { argb: draft ? "FFB45309" : "FF1E4F9C" } };
  const tiers = [...snap.scheme.tiers].sort((a, b) => b.minAchievementPct - a.minAchievementPct);
  ws.addRow([
    `Achievement = month's sales (product sales + project billing) / target. ${tiers.map((t) => `${t.minAchievementPct}%+ earns ${t.ratePct}%`).join(", ")} of sales. Sales person keeps ${snap.scheme.salesPersonSharePct}%; ${100 - snap.scheme.salesPersonSharePct}% goes to support staff.`,
  ]).font = { italic: true, size: 9, color: { argb: "FF64748B" } };
  ws.addRow([
    draft
      ? approval.status === "SUBMITTED" && approval.submittedBy
        ? `Submitted by ${approval.submittedBy?.name ?? ""} on ${when(approval.submittedAt)} - awaiting approval`
        : "Live figures - may change until approved"
      : `Prepared by ${approval.submittedBy?.name ?? ""} (${when(approval.submittedAt)}) · Approved by ${approval.approvedBy?.name ?? ""} (${when(approval.approvedAt)})`,
  ]).font = { size: 9 };
  ws.addRow([]);

  const head = ["Sales person", "Target", "Product sales", "Project billing", "Total sales", "Achievement", "Rate", "Incentive", "Share", "To support pool", "Salary support %", "Salary support", "To receive"];
  const h = ws.addRow(head);
  h.font = bold;
  h.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EFF9" } };
    c.border = { bottom: { style: "thin" } };
    c.alignment = { wrapText: true, vertical: "middle" };
  });
  const first = h.number + 1;
  for (const r of snap.rows) {
    const row = ws.addRow([
      r.name,
      r.target,
      r.productSales,
      r.projectSales,
      r.sales,
      r.achievement,
      r.rate,
      r.incentive,
      r.payout,
      r.toPool,
      r.salarySupportPct ? r.salarySupportPct / 100 : null,
      r.salarySupport,
      r.totalToReceive,
    ]);
    if (r.rate <= 0) row.getCell(7).value = "Not eligible";
  }
  const last = ws.lastRow!.number;
  const total = ws.addRow(["Sales team total"]);
  for (const col of [2, 3, 4, 5, 8, 9, 10, 12, 13]) {
    const L = ws.getColumn(col).letter;
    total.getCell(col).value = { formula: `SUM(${L}${first}:${L}${last})` };
  }
  total.font = bold;
  total.eachCell((c) => (c.border = { top: { style: "thin" } }));
  for (const col of [2, 3, 4, 5, 8, 9, 10, 12, 13]) ws.getColumn(col).numFmt = money;
  ws.getColumn(6).numFmt = "0.0%";
  ws.getColumn(7).numFmt = "0.000%";
  ws.getColumn(11).numFmt = "0%";
  const teamTotalRef = `M${total.number}`;

  ws.addRow([]);
  ws.addRow(["Support staff (share of the pool)"]).font = bold;
  const sh = ws.addRow(["Name", "Role", "", "", "", "", "", "", "", "", "", "", "Amount"]);
  sh.font = bold;
  const sFirst = sh.number + 1;
  for (const x of snap.support) ws.addRow([x.name, x.role, "", "", "", "", "", "", "", "", "", "", x.amount]);
  const sLast = ws.lastRow!.number;
  const st = ws.addRow(["Support staff total"]);
  st.getCell(13).value = snap.support.length ? { formula: `SUM(M${sFirst}:M${sLast})` } : 0;
  st.font = bold;

  ws.addRow([]);
  const grand = ws.addRow(["TOTAL PAYABLE (sales team + support staff)"]);
  grand.getCell(13).value = { formula: `${teamTotalRef}+M${st.number}` };
  grand.font = { bold: true, size: 12 };
  grand.getCell(13).numFmt = money;

  ws.columns.forEach((c, i) => (c.width = [26, 14, 15, 15, 15, 11, 10, 14, 14, 14, 10, 14, 16][i] ?? 12));
  ws.views = [{ state: "frozen", ySplit: h.number }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
