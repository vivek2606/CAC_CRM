import Link from "next/link";

type Tab = "billing" | "service" | "invoice";

// Project & Service Billing, Service Billings (the Head) and the invoice
// that claims the balance payment - one section, one tab each.
export function BillingTabs({ active, isHead }: { active: Tab; isHead: boolean }) {
  const tab = (key: Tab, href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${active === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
      {tab("billing", "/project-billing", "Project & Service Billing")}
      {isHead && tab("service", "/service-billings", "Service Billings")}
      {tab("invoice", "/project-billing/invoice", "Invoice (balance payment)")}
    </div>
  );
}
