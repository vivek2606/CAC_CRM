import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { BRANCH_SALES_WHERE } from "@/lib/branch-sales";
import { BILLING_COMPANIES } from "@/lib/billing-company";
import { formatCurrency, formatDate } from "@/lib/format";
import { BranchSaleForm } from "./branch-sales-forms";

// Upcountry branch sales people's CAC sales, added by hand by the Head or the
// Sales Coordinator. Shown as "Others" in the Sales Register.
export default async function BranchSalesPage() {
  await requireBackOffice();
  const [people, accounts, products] = await Promise.all([
    prisma.user.findMany({ where: BRANCH_SALES_WHERE, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    prisma.product.findMany({ orderBy: { model: "asc" }, select: { id: true, model: true, code: true, category: true } }),
  ]);
  const recent = people.length
    ? await prisma.deal.findMany({
        where: { ownerId: { in: people.map((p) => p.id) }, stage: "WON" },
        orderBy: { closedAt: "desc" },
        take: 30,
        select: { id: true, title: true, value: true, closedAt: true, invoiceNo: true, billingCompany: true, owner: { select: { name: true } } },
      })
    : [];

  return (
    <div>
      <PageHeader title="Branch Sales" description="Upcountry branch sales people's CAC sales - no login needed; shown as Others in the Sales Register" />
      <div className="p-6 space-y-5">
        <Link href="/reports/sales-register" className="text-sm text-indigo-600 hover:text-indigo-500">
          ← Sales Register
        </Link>
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Add a branch sale</h2>
          <p className="mb-3 mt-1 text-xs text-slate-500">
            For upcountry branch sales people selling CAC products. Type their name (as in the Sales Register, if they&apos;re in it) - all of them show together as{" "}
            <b>Others</b> in the Sales Register, with their name alongside.
          </p>
          <BranchSaleForm
            people={people.map((p) => p.name)}
            companies={BILLING_COMPANIES}
            accounts={accounts.map((a) => ({ id: a.id, label: a.code ? `${a.name} (${a.code})` : a.name }))}
            products={products.map((p) => ({ id: p.id, label: `${p.model} (${p.code})`, hint: p.category }))}
          />
        </Card>
        {recent.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Latest branch sales</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Invoice</th>
                    <th className="py-2 pr-3 font-medium">Customer</th>
                    <th className="py-2 pr-3 font-medium">Sales person</th>
                    <th className="py-2 pr-3 text-right font-medium">Value excl. VAT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recent.map((d) => (
                    <tr key={d.id}>
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{d.closedAt ? formatDate(d.closedAt) : ""}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-600">
                        {d.invoiceNo ?? ""}
                        {d.billingCompany ? <span className="text-xs text-slate-400"> · {d.billingCompany}</span> : null}
                      </td>
                      <td className="py-2 pr-3">
                        <Link href={`/deals/${d.id}`} className="text-indigo-600 hover:text-indigo-500">
                          {d.title.replace(/ — branch sale$/, "")}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{d.owner.name}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(d.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
