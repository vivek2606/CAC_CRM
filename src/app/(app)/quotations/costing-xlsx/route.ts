import { requireUser, canDownloadQuoteExcel } from "@/lib/rbac";
import { documentInputSchema } from "@/lib/sales-document";
import { getCompanySettings } from "@/lib/company-profile";
import { buildQuoteCostingXlsx } from "@/lib/quote-costing-xlsx";

// The internal costing sheet for the quote in the builder (costs, margins,
// our rates). Built from the form as it stands - nothing is saved.
export async function POST(request: Request) {
  const user = await requireUser();
  if (!canDownloadQuoteExcel(user)) return Response.json({ error: "Excel downloads aren't available for you." }, { status: 403 });
  const parsed = documentInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the quotation." }, { status: 400 });
  const input = parsed.data;
  if (!input.rows.some((r) => r.kind === "item" && (r.costRate != null || r.costInstall != null))) {
    return Response.json({ error: "No line has a cost - nothing to cost." }, { status: 400 });
  }
  const buffer = await buildQuoteCostingXlsx(input, (await getCompanySettings()).vatRatePct);
  const who = (input.to.split("\n")[0] ?? "").replace(/[^A-Za-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
  const ref = input.ref.replace(/[^A-Za-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${["Costing", ref, who].filter(Boolean).join("_")}.xlsx"`,
    },
  });
}
