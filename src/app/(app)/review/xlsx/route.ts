import { requireUser } from "@/lib/rbac";
import { getReviewPack } from "@/lib/review-pack";
import { buildReviewPackXlsx } from "@/lib/review-pack-xlsx";
import { getCompanySettings, pickCompany } from "@/lib/company-profile";
import { reviewScope } from "../access";

// /review/xlsx?month=YYYY-MM&rep=<id> - the monthly review pack in Excel.
export async function GET(request: Request) {
  const user = await requireUser();
  const sp = new URL(request.url).searchParams;
  const { month, repId } = await reviewScope(user, { month: sp.get("month"), rep: sp.get("rep") });
  const pack = await getReviewPack(month, repId);
  const settings = await getCompanySettings();
  const buf = await buildReviewPackXlsx(pack, pickCompany(settings, settings.defaultCompany).name);
  const who = pack.scope.kind === "division" ? "Division" : pack.scope.name.replace(/[^A-Za-z0-9]+/g, "-");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Review-${who}-${month}.xlsx"`,
    },
  });
}
