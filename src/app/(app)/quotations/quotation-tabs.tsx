import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";

type Tab = "new" | "saved" | "report" | "approvals";

// New quotation (the builder) / Saved quotations / Quote-to-win report /
// (Head) discount approvals, with how many are waiting.
export async function QuotationTabs({ active }: { active: Tab }) {
  const user = await requireUser();
  const waiting = user.role === "HEAD" ? await prisma.quotation.count({ where: { discountStatus: "pending" } }) : null;
  const tab = (key: Tab, href: string, label: string, badge?: number) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${active === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
    >
      {label}
      {badge ? <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-semibold text-white">{badge}</span> : null}
    </Link>
  );
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
      {tab("new", "/quotations", "New quotation")}
      {tab("saved", "/quotations/saved", "Saved quotations")}
      {tab("report", "/quotations/report", "Report")}
      {waiting != null && tab("approvals", "/quotations/approvals", "Approvals", waiting)}
    </div>
  );
}
