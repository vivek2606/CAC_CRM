import { requireBackOffice } from "@/lib/rbac";
import { forecastSettings, getModelForecasts } from "@/lib/model-forecast";
import { buildModelForecastXlsx } from "@/lib/model-forecast-xlsx";

// The Midea order plan in Excel - every model with sales in the last few
// years or stock / goods in transit / pending orders.
export async function GET(request: Request) {
  await requireBackOffice();
  const q = new URL(request.url).searchParams;
  const settings = forecastSettings({ arrive: q.get("arrive"), g: q.get("g"), gr: q.get("gr"), go: q.get("go") });
  const rows = (await getModelForecasts(settings))
    .filter((f) => f.history.some((y) => y.total !== 0) || f.stock > 0 || f.transit > 0 || f.paid > 0 || f.unpaid > 0)
    .sort((a, b) => b.order - a.order || b.shortBefore - a.shortBefore || b.needAfter - a.needAfter || a.model.localeCompare(b.model));
  const buffer = await buildModelForecastXlsx(rows, settings);
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Midea-order-plan-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
