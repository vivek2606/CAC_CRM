import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatCompactCurrency, formatDate } from "@/lib/format";

// Breaks the Won sales total the Dashboard / Targets use for a period into
// where it comes from, and checks the imported deals against the imported
// line items (both built from the same register rows, so they should
// match month by month). Meant for tracing a gap against the register file.

function parseMonth(raw: string | undefined, fallback: Date): Date {
  const m = raw?.match(/^(\d{4})-(\d{1,2})$/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)) : fallback;
}

function monthValue(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function ReconcilePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireHead();
  const params = await searchParams;
  const now = new Date();
  const from = parseMonth(params.from, new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)));
  const to = parseMonth(params.to, new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 1));
  const months: Date[] = [];
  for (let d = from; d < end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(d);

  const [deals, lineItemGroups, serviceUsers, dealsWithoutItems] = await Promise.all([
    prisma.deal.findMany({
      where: { stage: "WON", closedAt: { gte: from, lt: end } },
      select: { id: true, sourceTxnNo: true, value: true, closedAt: true, title: true, ownerId: true, owner: { select: { name: true } } },
    }),
    // Imported line items only - "deal-item:" ones mirror CRM-entered deals.
    prisma.saleLineItem.groupBy({
      by: ["month"],
      where: { month: { gte: from, lt: end }, NOT: { sourceKey: { startsWith: "deal-item:" } } },
      _sum: { value: true },
    }),
    prisma.user.findMany({ where: { isActive: true, title: "Service Manager" }, select: { id: true } }),
    prisma.deal.findMany({
      where: { stage: "WON", closedAt: { gte: from, lt: end }, sourceTxnNo: { not: null }, lineItems: { none: {} } },
      orderBy: { value: "desc" },
      select: { id: true, sourceTxnNo: true, value: true, closedAt: true, title: true, owner: { select: { name: true } } },
    }),
  ]);
  const serviceIds = new Set(serviceUsers.map((u) => u.id));

  const sum = (xs: { value: number }[]) => xs.reduce((s, d) => s + d.value, 0);
  const registerOrders = deals.filter((d) => d.sourceTxnNo != null && d.value > 0);
  const registerReturns = deals.filter((d) => d.sourceTxnNo != null && d.value < 0);
  const crmEntered = deals.filter((d) => d.sourceTxnNo == null);
  const service = deals.filter((d) => serviceIds.has(d.ownerId));
  const dashboardTotal = sum(deals) - sum(service);
  const lineItemTotal = lineItemGroups.reduce((s, g) => s + (g._sum.value ?? 0), 0);

  const monthKey = (d: Date) => monthValue(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const lineItemsByMonth = new Map(lineItemGroups.map((g) => [monthValue(g.month), g._sum.value ?? 0]));
  const monthRows = months.map((m) => {
    const key = monthValue(m);
    const inMonth = deals.filter((d) => d.closedAt && monthKey(d.closedAt) === key);
    const register = sum(inMonth.filter((d) => d.sourceTxnNo != null));
    const items = lineItemsByMonth.get(key) ?? 0;
    return {
      key,
      label: monthLabel(m),
      register,
      items,
      diff: register - items,
      crm: sum(inMonth.filter((d) => d.sourceTxnNo == null)),
      service: sum(inMonth.filter((d) => serviceIds.has(d.ownerId))),
    };
  });

  const topRegister = [...registerOrders].sort((a, b) => b.value - a.value).slice(0, 15);
  const rangeLabel = `${monthLabel(from)} – ${monthLabel(to)}`;
  const diffClass = (v: number) => (Math.abs(v) < 1 ? "text-slate-400" : "text-rose-600 font-medium");

  return (
    <div>
      <PageHeader
        title="Reconcile Sales"
        description={`Where the Won sales total comes from - ${rangeLabel}`}
        action={
          <Link href="/admin/import/sales-register" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← Sales Register import
          </Link>
        }
      />
      <div className="p-6 space-y-4">
        <form className="flex flex-wrap items-end gap-3" action="/admin/import/sales-register/reconcile">
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

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Breakdown</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2 text-slate-600">Register invoices ({registerOrders.length})</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(sum(registerOrders))}</td>
              </tr>
              <tr>
                <td className="py-2 text-slate-600">Register returns / credit notes ({registerReturns.length})</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(sum(registerReturns))}</td>
              </tr>
              <tr>
                <td className="py-2 text-slate-600">Deals entered in the CRM ({crmEntered.length})</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(sum(crmEntered))}</td>
              </tr>
              <tr>
                <td className="py-2 text-slate-600">Less: Service Manager&apos;s sales ({service.length})</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(-sum(service))}</td>
              </tr>
              <tr className="font-semibold text-slate-900">
                <td className="py-2">Department total (Dashboard / Targets)</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(dashboardTotal)}</td>
              </tr>
              <tr>
                <td className="py-2 text-slate-500">
                  Register line items (should equal your Excel&apos;s Net Amt, excluding &quot;Project &amp; Service&quot; rows)
                </td>
                <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(lineItemTotal)}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card>
          <div className="p-4 pb-0">
            <h2 className="text-sm font-semibold text-slate-900">By month</h2>
            <p className="text-xs text-slate-500 mt-1">
              Register deals and register line items come from the same rows, so they should match. A difference
              means deals in the CRM that this register no longer supports - usually left over from an earlier upload.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="px-3 py-3 font-medium text-right">Register deals</th>
                  <th className="px-3 py-3 font-medium text-right">Register line items</th>
                  <th className="px-3 py-3 font-medium text-right">Difference</th>
                  <th className="px-3 py-3 font-medium text-right">CRM-entered</th>
                  <th className="px-4 py-3 font-medium text-right">Service</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthRows.map((r) => (
                  <tr key={r.key}>
                    <td className="px-4 py-2.5 text-slate-800">{r.label}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCompactCurrency(r.register)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCompactCurrency(r.items)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${diffClass(r.diff)}`}>{formatCompactCurrency(r.diff)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCompactCurrency(r.crm)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCompactCurrency(r.service)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="p-4 pb-0">
            <h2 className="text-sm font-semibold text-slate-900">
              Register deals with no line items ({dealsWithoutItems.length}, {formatCompactCurrency(sum(dealsWithoutItems))})
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Every imported invoice normally has its product lines. One without any is likely left over from an earlier
              upload - check whether its invoice number is in your register file.
            </p>
          </div>
          {dealsWithoutItems.length === 0 ? (
            <div className="p-4"><EmptyState title="None - every imported deal has its line items" /></div>
          ) : (
            <DealTable deals={dealsWithoutItems.slice(0, 100)} />
          )}
        </Card>

        <Card>
          <div className="p-4 pb-0">
            <h2 className="text-sm font-semibold text-slate-900">Largest register invoices</h2>
            <p className="text-xs text-slate-500 mt-1">To spot any amount that looks wrong against the file.</p>
          </div>
          <DealTable deals={topRegister} />
        </Card>
      </div>
    </div>
  );
}

function DealTable({
  deals,
}: {
  deals: { id: string; sourceTxnNo: number | null; value: number; closedAt: Date | null; title: string; owner: { name: string } }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-3 font-medium">Invoice #</th>
            <th className="px-3 py-3 font-medium">Date</th>
            <th className="px-3 py-3 font-medium">Deal</th>
            <th className="px-3 py-3 font-medium">Sales person</th>
            <th className="px-4 py-3 font-medium text-right">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {deals.map((d) => (
            <tr key={d.id}>
              <td className="px-4 py-2.5 text-slate-600 tabular-nums">{d.sourceTxnNo ?? "—"}</td>
              <td className="px-3 py-2.5 text-slate-600">{formatDate(d.closedAt)}</td>
              <td className="px-3 py-2.5">
                <Link href={`/deals/${d.id}`} className="text-indigo-600 hover:text-indigo-700">
                  {d.title}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-slate-600">{d.owner.name}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
