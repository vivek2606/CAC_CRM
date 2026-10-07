import Link from "next/link";

// Tabs for Incentives & Targets (one menu item). Keeps the chosen month
// when switching between the two.
export function PerfTabs({ active, month }: { active: "incentives" | "targets"; month?: string }) {
  const q = month ? `?month=${month}` : "";
  const tab = (key: "incentives" | "targets", label: string) => (
    <Link
      href={`/${key}${q}`}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${active === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1">
      {tab("incentives", "Incentives")}
      {tab("targets", "Targets")}
    </div>
  );
}
