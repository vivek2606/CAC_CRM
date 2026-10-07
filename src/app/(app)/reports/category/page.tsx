import { redirect } from "next/navigation";

// Sales by Category now lives in the Sales Register, as its "By category" tab.
export default async function CategoryReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const qs = new URLSearchParams({ view: "category" });
  for (const [k, v] of Object.entries(params)) if (v && k !== "view") qs.set(k, v);
  redirect(`/reports/sales-register?${qs}`);
}
