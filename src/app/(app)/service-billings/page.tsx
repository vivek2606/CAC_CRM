import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatCompactCurrency, formatDate } from "@/lib/format";
import { ExportCsvButton } from "@/components/export-csv-button";

// Service billing (Head only): the Service Manager's billing from the Sales
// Register - Project & Service lines plus any product invoices under his
// name. Kept out of department sales, targets and incentives.

function parseMonth(raw: string | undefined, fallback: Date): Date {
  const m = raw?.match(/^(\d{4})-(\d{1,2})$/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)) : fallback;
}
const monthValue = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export default async function ServiceBillingsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireHead();
  const params = await searchParams;
  const now = new Date();
  const from = parseMonth(params.from, new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));
  const to = parseMonth(params.to, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 1));
  const months: Date[] = [];
  for (let d = from; d < end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(d);

  const serviceUsers = await prisma.user.findMany({
    where: { isActive: true, title: "Service Manager" },
    select: { id: true, name: true },
  });
  const ids = serviceUsers.map((u) => u.id);
  const [billings, deals] = await Promise.all([
    prisma.projectBilling.findMany({
      where: { ownerId: { in: ids }, month: { gte: from, lt: end } },
      orderBy: { docDate: "desc" },
    }),
    prisma.deal.findMany({
      where: { ownerId: { in: ids }, stage: "WON", closedAt: { gte: from, lt: end } },
      orderBy: { closedAt: "desc" },
      select: { id: true, title: true, value: true, closedAt: true, sourceTxnNo: true },
    }),
  ]);

  const key = (d: Date) => monthValue(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const monthRows = months.map((m) => {
    const k = monthValue(m);
    const service = billings.filter((b) => key(b.month) === k).reduce((s, b) => s + b.value, 0);
    const product = deals.filter((d) => d.closedAt && key(d.closedAt) === k).reduce((s, d) => s + d.value, 0);
    return { k, label: monthLabel(m), service, product, total: service + product };
  });
  const totalService = billings.reduce((s, b) => s + b.value, 0);
  const totalProduct = deals.reduce((s, d) => s + d.value, 0);
  const rangeLabel = `${monthLabel(from)} – ${monthLabel(to)}`;
  const who = serviceUsers.map((u) => u.name).join(", ") || "Service Manager";

  return (
    <div>
      <PageHeader title="Service Billings" description={`${who} - ${rangeLabel}`} />
      <div className="p-6 space-y-4">
        <form className="flex flex-wrap items-end gap-3" action="/service-billings">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
            <input type="month" name="from" defaultValue={monthValue(from)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
            <input type="month" name="to" defaultValue={monthValue(to)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700">
            Go
          </button>
        </form>

        {serviceUsers.length === 0 ? (
          <Card className="p-6">
            <EmptyState title="No Service Manager login found" description="Service billing is matched by the job title “Service Manager”." />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4">
                <p className="text-sm text-slate-500">Service billing</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCompactCurrency(totalService)}</p>
                <p className="text-xs text-slate-400 mt-1">Project &amp; Service lines ({billings.length})</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-slate-500">Product invoices</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCompactCurrency(totalProduct)}</p>
                <p className="text-xs text-slate-400 mt-1">Units billed under {who} ({deals.length})</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-slate-500">Total billed</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCompactCurrency(totalService + totalProduct)}</p>
                <p className="text-xs text-slate-400 mt-1">Not counted in department sales or targets</p>
              </Card>
            </div>

            <Card>
              <div className="flex items-center justify-between p-4 pb-0">
                <h2 className="text-sm font-semibold text-slate-900">By month</h2>
                <ExportCsvButton
                  filename={`service-billings-${monthValue(from)}-to-${monthValue(to)}.csv`}
                  headers={["Month", "Service billing", "Product invoices", "Total"]}
                  rows={monthRows.map((r) => [r.label, r.service, r.product, r.total])}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 font-medium">Month</th>
                      <th className="px-3 py-3 font-medium text-right">Service billing</th>
                      <th className="px-3 py-3 font-medium text-right">Product invoices</th>
                      <th className="px-4 py-3 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthRows.map((r) => (
                      <tr key={r.k}>
                        <td className="px-4 py-2.5 text-slate-800">{r.label}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(r.service)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(r.product)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatCurrency(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between p-4 pb-0">
                <h2 className="text-sm font-semibold text-slate-900">Service billing lines ({billings.length})</h2>
                <ExportCsvButton
                  filename={`service-billing-lines-${monthValue(from)}-to-${monthValue(to)}.csv`}
                  headers={["Date", "Invoice #", "Customer", "Item code", "Item", "Value"]}
                  rows={billings.map((b) => [b.docDate.toISOString().slice(0, 10), b.txnNo, b.custName, b.itemCode, b.itemName, b.value])}
                />
              </div>
              {billings.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    title="No service billing in this period"
                    description="It comes from the Project & Service rows of the Sales Register - re-upload it with Replace if it's missing."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-3 py-3 font-medium">Invoice #</th>
                        <th className="px-3 py-3 font-medium">Customer / item</th>
                        <th className="px-4 py-3 font-medium text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {billings.map((b) => (
                        <tr key={b.id}>
                          <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(b.docDate)}</td>
                          <td className="px-3 py-2.5 text-slate-600 tabular-nums">{b.txnNo}</td>
                          <td className="px-3 py-2.5">
                            <div className="text-slate-800">{b.custName}</div>
                            <div className="text-xs text-slate-400">
                              {b.itemCode} · {b.itemName}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{formatCurrency(b.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {deals.length > 0 && (
              <Card>
                <div className="p-4 pb-0">
                  <h2 className="text-sm font-semibold text-slate-900">Product invoices ({deals.length})</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-3 py-3 font-medium">Invoice #</th>
                        <th className="px-3 py-3 font-medium">Deal</th>
                        <th className="px-4 py-3 font-medium text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {deals.map((d) => (
                        <tr key={d.id}>
                          <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(d.closedAt)}</td>
                          <td className="px-3 py-2.5 text-slate-600 tabular-nums">{d.sourceTxnNo ?? "—"}</td>
                          <td className="px-3 py-2.5">
                            <Link href={`/deals/${d.id}`} className="text-indigo-600 hover:text-indigo-700">
                              {d.title}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{formatCurrency(d.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
