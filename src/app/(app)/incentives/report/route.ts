import { requireBackOffice } from "@/lib/rbac";
import { getIncentiveApproval, snapshotOf } from "@/lib/incentive-approval";
import { computeMonthIncentives } from "@/lib/incentive-month";
import { getCompanySettings, pickCompany } from "@/lib/company-profile";
import { renderIncentiveStatementPdf } from "@/lib/pdf/incentive-statement-pdf";
import { buildIncentiveReportXlsx } from "@/lib/incentive-report-xlsx";

// /incentives/report?month=YYYY-MM&format=pdf|xlsx - the month's incentive
// report. Once the Head has approved the month it's the approved figures
// (Head and Sales Coordinator); before that only the Head can download it,
// from live figures, marked DRAFT.
export async function GET(request: Request) {
  const user = await requireBackOffice();
  const params = new URL(request.url).searchParams;
  const raw = params.get("month") ?? "";
  const format = params.get("format") === "xlsx" ? "xlsx" : "pdf";
  const m = raw.match(/^(\d{4})-(\d{2})$/);
  if (!m) return new Response("Pick a month.", { status: 400 });
  const month = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));

  const approval = await getIncentiveApproval(month);
  const approved = approval?.status === "APPROVED" && !!approval.snapshot;
  if (!approved && user.role !== "HEAD") {
    return new Response("This month's incentives haven't been approved by the Head of Sales yet.", { status: 403 });
  }
  let snapshot = approved ? approval!.snapshot! : null;
  if (!snapshot) {
    const { settings, rows, support } = await computeMonthIncentives(month);
    snapshot = snapshotOf(rows, support, settings);
  }
  const report = { ...(approval ?? { status: "SUBMITTED" as const }), snapshot };
  const settings = await getCompanySettings();
  const company = pickCompany(settings, settings.defaultCompany);
  const label = month.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const name = `${approved ? "Incentive-Statement" : "Incentive-Report-DRAFT"}-${raw}`;

  if (format === "xlsx") {
    const buf = await buildIncentiveReportXlsx({ monthLabel: label, companyName: company.name, approval: report, draft: !approved });
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      },
    });
  }
  const pdf = await renderIncentiveStatementPdf({ monthLabel: label, approval: report, company, draft: !approved });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"` },
  });
}
