import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { ExportCsvButton } from "@/components/export-csv-button";

// Every line behind one sales person's sales figure for a month - the same
// figure Targets and Incentives use (Won deals + Project & Service
// billing) - so it can be ticked off against the register file.

function parseMonth(raw: string | undefined): Date {
  const m = raw?.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
}
const monthValue = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

type Line = {
  key: string;
  source: "Register invoice" | "Register return" | "Entered in CRM" | "Project & Service";
  docNo: string;
  date: Date;
  customer: string;
  detail: string;
  value: number;
  href?: string;
  flag?: string;
};

export default async function SalesBreakdownPage({
  searchParams,
}: {
  searchParams: Promise<{ rep?: string; month?: string }>;
}) {
  await requireBackOffice();
  const params = await searchParams;
  const month = parseMonth(params.month);
  const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const reps = await prisma.user.findMany({
    where: { isActive: true, OR: [{ title: "Sales Manager" }, { title: "Service Manager" }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const rep = reps.find((r) => r.id === params.rep) ?? null;

  const [deals, projects] = rep
    ? await Promise.all([
        prisma.deal.findMany({
          where: { ownerId: rep.id, stage: "WON", closedAt: { gte: month, lt: nextMonth } },
          orderBy: { closedAt: "asc" },
          select: {
            id: true,
            title: true,
            value: true,
            closedAt: true,
            sourceTxnNo: true,
            sourceDocKey: true,
            account: { select: { name: true } },
          },
        }),
        prisma.projectBilling.findMany({
          where: { ownerId: rep.id, month },
          orderBy: { docDate: "asc" },
        }),
      ])
    : [[], []];

  // A deal entered in the CRM for a customer who also has a register invoice
  // the same month is likely the same sale counted twice.
  const registerCustomers = new Set(
    deals.filter((d) => d.sourceTxnNo != null).map((d) => (d.account?.name ?? "").trim().toLowerCase()),
  );
  // The same invoice number appearing twice (e.g. once as a deal, once as
  // project billing) is worth a look too.
  const docCount = new Map<number, number>();
  for (const d of deals) if (d.sourceTxnNo != null) docCount.set(d.sourceTxnNo, (docCount.get(d.sourceTxnNo) ?? 0) + 1);
  const projectDocs = new Set(projects.map((p) => p.txnNo));

  const lines: Line[] = [
    ...deals.map((d): Line => {
      const imported = d.sourceTxnNo != null;
      const customer = d.account?.name ?? d.title.split(" — ")[0];
      let flag: string | undefined;
      if (!imported && registerCustomers.has(customer.trim().toLowerCase())) {
        flag = "Same customer also has a register invoice this month - possible double count";
      } else if (imported && (docCount.get(d.sourceTxnNo!) ?? 0) > 1) {
        flag = "Invoice number appears more than once";
      } else if (imported && projectDocs.has(d.sourceTxnNo!)) {
        flag = "Same invoice also has Project & Service lines";
      }
      return {
        key: d.id,
        source: !imported ? "Entered in CRM" : d.value < 0 ? "Register return" : "Register invoice",
        docNo: imported ? String(d.sourceTxnNo) : "—",
        date: d.closedAt!,
        customer,
        detail: d.title,
        value: d.value,
        href: `/deals/${d.id}`,
        flag,
      };
    }),
    ...projects.map(
      (p): Line => ({
        key: p.id,
        source: "Project & Service",
        docNo: String(p.txnNo),
        date: p.docDate,
        customer: p.custName,
        detail: `${p.itemCode} · ${p.itemName}`,
        value: p.value,
      }),
    ),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const total = lines.reduce((s, l) => s + l.value, 0);
  const bySource = (["Register invoice", "Register return", "Entered in CRM", "Project & Service"] as const).map((s) => {
    const xs = lines.filter((l) => l.source === s);
    return { source: s, count: xs.length, value: xs.reduce((t, l) => t + l.value, 0) };
  });
  const flagged = lines.filter((l) => l.flag).length;

  return (
    <div>
      <PageHeader
        title="Sales Breakdown"
        description={rep ? `${rep.name} - ${monthLabel(month)}` : "Every line behind a sales person's monthly sales"}
        action={
          <Link href={`/incentives?month=${monthValue(month)}`} className="text-sm text-indigo-600 hover:text-indigo-700">
            ← Incentives
          </Link>
        }
      />
      <div className="p-6 space-y-4">
        <form className="flex flex-wrap items-end gap-3" action="/reports/sales-breakdown">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Sales person</label>
            <select name="rep" defaultValue={rep?.id ?? ""} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="" disabled>
                Pick…
              </option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
            <input type="month" name="month" defaultValue={monthValue(month)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700">
            Show
          </button>
        </form>

        {!rep ? (
          <Card className="p-6">
            <EmptyState title="Pick a sales person and month" />
          </Card>
        ) : (
          <>
            <Card className="p-5">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {bySource.map((s) => (
                    <tr key={s.source}>
                      <td className="py-2 text-slate-600">
                        {s.source} ({s.count})
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatCurrency(s.value)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-slate-900">
                    <td className="py-2">Total (as used by Targets and Incentives)</td>
                    <td className="py-2 text-right tabular-nums">{formatCurrency(total)}</td>
                  </tr>
                </tbody>
              </table>
              {flagged > 0 && (
                <p className="mt-3 text-sm text-amber-700">
                  {flagged} line{flagged === 1 ? "" : "s"} flagged below - check whether they are counted twice.
                </p>
              )}
            </Card>

            <Card>
              <div className="flex items-center justify-between p-4 pb-0">
                <h2 className="text-sm font-semibold text-slate-900">All lines ({lines.length})</h2>
                <ExportCsvButton
                  filename={`sales-breakdown-${rep.name.replace(/\s+/g, "-")}-${monthValue(month)}.csv`}
                  headers={["Date", "Source", "Invoice #", "Customer", "Detail", "Value", "Flag"]}
                  rows={lines.map((l) => [l.date.toISOString().slice(0, 10), l.source, l.docNo, l.customer, l.detail, l.value, l.flag ?? ""])}
                />
              </div>
              {lines.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No sales this month" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-3 py-3 font-medium">Source</th>
                        <th className="px-3 py-3 font-medium">Invoice #</th>
                        <th className="px-3 py-3 font-medium">Customer / detail</th>
                        <th className="px-4 py-3 font-medium text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((l) => (
                        <tr key={l.key} className={l.flag ? "bg-amber-50" : ""}>
                          <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(l.date)}</td>
                          <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{l.source}</td>
                          <td className="px-3 py-2.5 text-slate-600 tabular-nums">{l.docNo}</td>
                          <td className="px-3 py-2.5">
                            {l.href ? (
                              <Link href={l.href} className="text-indigo-600 hover:text-indigo-700">
                                {l.customer}
                              </Link>
                            ) : (
                              <span className="text-slate-800">{l.customer}</span>
                            )}
                            <div className="text-xs text-slate-400">{l.detail}</div>
                            {l.flag && <div className="text-xs text-amber-700 font-medium">{l.flag}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{formatCurrency(l.value)}</td>
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
