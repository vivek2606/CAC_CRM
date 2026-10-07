import { requireBackOffice } from "@/lib/rbac";
import { getIncentiveApproval } from "@/lib/incentive-approval";
import { getCompanySettings, pickCompany } from "@/lib/company-profile";
import { renderIncentiveStatementPdf } from "@/lib/pdf/incentive-statement-pdf";

// /incentives/statement?month=YYYY-MM - the approved incentive statement
// (Head and Sales Coordinator), only once the Head has approved the month.
export async function GET(request: Request) {
  await requireBackOffice();
  const raw = new URL(request.url).searchParams.get("month") ?? "";
  const m = raw.match(/^(\d{4})-(\d{2})$/);
  if (!m) return new Response("Pick a month.", { status: 400 });
  const month = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const approval = await getIncentiveApproval(month);
  if (approval?.status !== "APPROVED" || !approval.snapshot) {
    return new Response("This month's incentives haven't been approved by the Head of Sales yet.", { status: 403 });
  }
  const settings = await getCompanySettings();
  const label = month.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const pdf = await renderIncentiveStatementPdf({
    monthLabel: label,
    approval: { ...approval, snapshot: approval.snapshot },
    company: pickCompany(settings, settings.defaultCompany),
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Incentive-Statement-${raw}.pdf"`,
    },
  });
}
