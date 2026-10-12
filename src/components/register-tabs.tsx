import Link from "next/link";

// Tabs of the Sales Register: the invoice lines, and won & lost deals with
// their insights (win rate, deal size, sales cycle, lost reasons).
export function RegisterTabs({ active }: { active: "lines" | "deals" }) {
  const tab = (key: "lines" | "deals", href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${active === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1">
      {tab("lines", "/reports/sales-register", "Register lines")}
      {tab("deals", "/deals/closed", "Won & lost deals")}
    </div>
  );
}
