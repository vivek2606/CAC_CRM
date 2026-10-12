import Link from "next/link";

// New quotation (the builder) / Saved quotations.
export function QuotationTabs({ active }: { active: "new" | "saved" }) {
  const tab = (key: "new" | "saved", href: string, label: string) => (
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
    </div>
  );
}
