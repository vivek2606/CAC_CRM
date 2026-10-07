import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatCompactCurrency, formatDate } from "@/lib/format";
import { ExportCsvButton } from "@/components/export-csv-button";
import { isCrmEntered } from "@/lib/project-billing";

// Service billing (Head only): everything invoiced under the Service
// Manager (Sikiru) is service billing - not product sales - whether it came
// from the Sales Register or was entered in the CRM. Kept out of
// department sales, targets and incentives.

function parseMonth(raw: string | undefined, fallback: Date): Date {
  const m = raw?.match(/^(\d{4})-(\d{1,2})$/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)) : fallback;
}
const monthValue = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

type Line = { id: string; date: Date; invoice: string; customer: string; detail: string; value: number; source: string; href?: string };

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
    prisma.projectBilling.findMany({ where: { ownerId: { in: ids }, month: { gte: from, lt: end } } }),
    // Won deals under him (entered in the CRM, or imported before the
    // register import moved his invoices to service billing) - service too.
    prisma.deal.findMany({
      where: { ownerId: { in: ids }, stage: "WON", closedAt: { gte: from, lt: end } },
      select: { id: true, title: true, value: true, closedAt: true, sourceTxnNo: true, account: { select: { name: true } } },
    }),
  ]);

  const lines: Line[] = [
    ...billings.map((b) => ({
      id: b.id,
      date: b.docDate,
      invoice: isCrmEntered(b.sourceKey) ? b.docKey || "—" : String(b.txnNo),
      customer: b.custName,
      detail: `${b.itemCode} · ${b.itemName}`,
      value: b.value,
      source: isCrmEntered(b.sourceKey) ? "Entered in CRM" : "Sales Register",
    })),
    ...deals.map((d) => ({
      id: d.id,
      date: d.closedAt!,
      invoice: d.sourceTxnNo != null ? String(d.sourceTxnNo) : "—",
      customer: d.account?.name ?? d.title.split(" — ")[0],
      detail: d.title,
      value: d.value,
      source: d.sourceTxnNo != null ? "Sales Register" : "CRM deal",
      href: `/deals/${d.id}`,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const key = (d: Date) => monthValue(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const monthRows = months.map((m) => {
    const k = monthValue(m);
    const inMonth = lines.filter((l) => key(l.date) === k);
    return { k, label: monthLabel(m), count: inMonth.length, total: inMonth.reduce((s, l) => s + l.value, 0) };
  });
  const total = lines.reduce((s, l) => s + l.value, 0);
  const invoices = new Set(lines.map((l) => `${l.invoice}|${key(l.date)}|${l.customer}`)).size;
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="p-4">
                <p className="text-sm text-slate-500">Service billing</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCompactCurrency(total)}</p>
                <p className="text-xs text-slate-400 mt-1">Not counted in department sales, targets or incentives</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-slate-500">Invoices</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">{invoices}</p>
                <p className="text-xs text-slate-400 mt-1">{lines.length} billing lines</p>
              </Card>
            </div>

            <Card>
              <div className="flex items-center justify-between p-4 pb-0">
                <h2 className="text-sm font-semibold text-slate-900">By month</h2>
                <ExportCsvButton
                  filename={`service-billings-${monthValue(from)}-to-${monthValue(to)}.csv`}
                  headers={["Month", "Lines", "Service billing"]}
                  rows={monthRows.map((r) => [r.label, r.count, r.total])}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 font-medium">Month</th>
                      <th className="px-3 py-3 font-medium text-right">Lines</th>
                      <th className="px-4 py-3 font-medium text-right">Service billing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthRows.map((r) => (
                      <tr key={r.k}>
                        <td className="px-4 py-2.5 text-slate-800">{r.label}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{r.count}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatCurrency(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between p-4 pb-0">
                <h2 className="text-sm font-semibold text-slate-900">Service billing lines ({lines.length})</h2>
                <ExportCsvButton
                  filename={`service-billing-lines-${monthValue(from)}-to-${monthValue(to)}.csv`}
                  headers={["Date", "Invoice #", "Customer", "Detail", "Value (excl. VAT)", "Source"]}
                  rows={lines.map((l) => [l.date.toISOString().slice(0, 10), l.invoice, l.customer, l.detail, l.value, l.source])}
                />
              </div>
              {lines.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    title="No service billing in this period"
                    description="It comes from the Sales Register, or from Project & Service Billing entries under the Service Manager."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-3 py-3 font-medium">Invoice #</th>
                        <th className="px-3 py-3 font-medium">Customer / detail</th>
                        <th className="px-3 py-3 font-medium text-right">Value (excl. VAT)</th>
                        <th className="px-4 py-3 font-medium">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((l) => (
                        <tr key={l.id}>
                          <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(l.date)}</td>
                          <td className="px-3 py-2.5 text-slate-600 tabular-nums">{l.invoice}</td>
                          <td className="px-3 py-2.5">
                            {l.href ? (
                              <Link href={l.href} className="text-indigo-600 hover:text-indigo-700">
                                {l.customer}
                              </Link>
                            ) : (
                              <div className="text-slate-800">{l.customer}</div>
                            )}
                            <div className="text-xs text-slate-400">{l.detail}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{formatCurrency(l.value)}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{l.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
