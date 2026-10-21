import { requireBackOffice } from "@/lib/rbac";
import { getModelPlans, parseArrival } from "@/lib/model-planning";
import { buildModelPlanningXlsx } from "@/lib/model-planning-xlsx";

// Excel ordering sheet for Midea - every model, month-wise sales of this
// year and last, stock position and the quantity to order.
export async function GET(request: Request) {
  await requireBackOffice();
  const q = new URL(request.url).searchParams;
  const cover = Number(q.get("cover"));
  const coverMonths = [3, 4, 5, 6].includes(cover) ? cover : 4;
  const { window, plans } = await getModelPlans(coverMonths, undefined, parseArrival(q.get("arrive")));
  const shown = plans
    .filter((p) => p.years.some((y) => y.total !== 0) || p.stock > 0 || p.transit > 0 || p.paid > 0 || p.unpaid > 0)
    .sort((a, b) => b.suggested - a.suggested || b.years[0].total - a.years[0].total || a.model.localeCompare(b.model));
  const buffer = await buildModelPlanningXlsx(shown, window, coverMonths);
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Midea-order-plan-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
