import Link from "next/link";

type Tab = "new" | "saved" | "report";

// New quotation (the builder) / Saved quotations / Quote-to-win report.
export function QuotationTabs({ active }: { active: Tab }) {
  const tab = (key: Tab, href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${active === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1">
      {tab("new", "/quotations", "New quotation")}
      {tab("saved", "/quotations/saved", "Saved quotations")}
      {tab("report", "/quotations/report", "Report")}
    </div>
  );
}
