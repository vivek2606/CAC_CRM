import { redirect } from "next/navigation";

// Sales by Category is now the charts on the Sales Register, which follow
// the register's filters. Old links keep their period where they had one.
export default async function CategoryReportPage({ searchParams }: { searchParams: Promise<{ mode?: string; month?: string; year?: string; rep?: string }> }) {
  const p = await searchParams;
  const qs = new URLSearchParams();
  const m = p.month?.match(/^(\d{4})-(\d{2})$/);
  if (p.mode === "year" && /^\d{4}$/.test(p.year ?? "")) {
    qs.set("from", `${p.year}-01-01`);
    qs.set("to", `${p.year}-12-31`);
  } else if (m) {
    const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
    qs.set("from", `${m[1]}-${m[2]}-01`);
    qs.set("to", `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}`);
  }
  if (p.rep && p.rep !== "all") qs.set("rep", p.rep);
  redirect(`/reports/sales-register${qs.size ? `?${qs}` : ""}`);
}
