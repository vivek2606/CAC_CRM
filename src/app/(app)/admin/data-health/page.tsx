import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";

// Everything that needs fixing in one place, for the Head and the Sales
// Coordinator: won sales with details missing, the same invoice recorded
// twice, register lines with no deal, accounts with no customer code, leads
// gone quiet and deals past their expected close. Each line links to the fix.

const DAY = 86400000;
const QUIET_DAYS = 14;
const SHOW = 50;

export default async function DataHealthPage() {
  await requireBackOffice();
  const now = new Date();
  const quietBefore = new Date(now.getTime() - QUIET_DAYS * DAY);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [incompleteWon, wonWithInvoice, orphanLines, noCode, noCodeCount, quietLeads, pastClose] = await Promise.all([
    // Won in the CRM with the account, company, products or invoice no. missing.
    prisma.deal.findMany({
      where: {
        stage: "WON",
        sourceTxnNo: null,
        OR: [{ accountId: null }, { billingCompany: null }, { invoiceNo: null }, { items: { none: {} } }],
      },
      orderBy: { closedAt: "desc" },
      take: 300,
      select: {
        id: true,
        title: true,
        value: true,
        closedAt: true,
        accountId: true,
        billingCompany: true,
        invoiceNo: true,
        _count: { select: { items: true } },
        owner: { select: { name: true } },
      },
    }),
    // Every won sale with an invoice no., to find the same invoice twice.
    prisma.deal.findMany({
      where: { stage: "WON", OR: [{ invoiceNo: { not: null } }, { sourceTxnNo: { not: null } }] },
      select: { id: true, title: true, value: true, closedAt: true, invoiceNo: true, sourceTxnNo: true, billingCompany: true, owner: { select: { name: true } } },
    }),
    // Register lines with no deal behind them, by month.
    prisma.saleLineItem.groupBy({ by: ["month"], where: { dealId: null }, _count: true, _sum: { value: true }, orderBy: { month: "desc" } }),
    prisma.account.findMany({ where: { OR: [{ code: null }, { code: "" }] }, orderBy: { name: "asc" }, take: SHOW, select: { id: true, name: true, owner: { select: { name: true } } } }),
    prisma.account.count({ where: { OR: [{ code: null }, { code: "" }] } }),
    prisma.lead.findMany({
      where: {
        status: { notIn: ["CONVERTED", "UNQUALIFIED"] },
        createdAt: { lt: quietBefore },
        activities: { none: { createdAt: { gte: quietBefore } } },
      },
      orderBy: { createdAt: "asc" },
      take: 300,
      select: { id: true, title: true, createdAt: true, owner: { select: { name: true } } },
    }),
    prisma.deal.findMany({
      where: { stage: { notIn: ["WON", "LOST"] }, expectedCloseDate: { lt: today } },
      orderBy: { expectedCloseDate: "asc" },
      take: 300,
      select: { id: true, title: true, value: true, expectedCloseDate: true, owner: { select: { name: true } } },
    }),
  ]);

  // The same invoice (number + company, or company not recorded) on two or more won sales.
  const byNo = new Map<string, typeof wonWithInvoice>();
  for (const d of wonWithInvoice) {
    const no = (d.invoiceNo ?? String(d.sourceTxnNo ?? "")).trim().toLowerCase();
    if (!no) continue;
    byNo.set(no, [...(byNo.get(no) ?? []), d]);
  }
  const duplicates: (typeof wonWithInvoice)[] = [];
  for (const group of byNo.values()) {
    if (group.length < 2) continue;
    // Within a number, a clash is two sales whose companies match or aren't both known.
    // ERP uploads number each document series (invoices, returns...) on its
    // own, so two imported documents can share a number - only a clash
    // involving a sale entered in the CRM is a double count.
    const clash = group.filter((a) =>
      group.some(
        (b) =>
          b.id !== a.id &&
          (a.sourceTxnNo == null || b.sourceTxnNo == null) &&
          (!a.billingCompany || !b.billingCompany || a.billingCompany === b.billingCompany),
      ),
    );
    if (clash.length > 1) duplicates.push(clash);
  }

  const missing = (d: (typeof incompleteWon)[number]) =>
    [!d.accountId && "account", !d.billingCompany && "company", !d.invoiceNo && "invoice no.", d._count.items === 0 && "products"].filter(Boolean).join(", ");
  const orphanTotal = orphanLines.reduce((s, g) => s + g._count, 0);
  const monthLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const monthParam = (d: Date) => {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const mm = String(m + 1).padStart(2, "0");
    return `from=${y}-${mm}-01&to=${y}-${mm}-${last}`;
  };

  const sections = [
    { key: "dup", label: "Same invoice recorded twice", count: duplicates.length },
    { key: "won", label: "Won sales with details missing", count: incompleteWon.length },
    { key: "orphan", label: "Sales Register lines with no deal", count: orphanTotal },
    { key: "code", label: "Accounts with no customer code", count: noCodeCount },
    { key: "quiet", label: `Leads with no activity for ${QUIET_DAYS}+ days`, count: quietLeads.length },
    { key: "close", label: "Open deals past their expected close", count: pastClose.length },
  ];
  const th = "py-2 pr-3 font-medium";
  const link = "font-medium text-indigo-700 hover:underline";

  return (
    <div>
      <PageHeader title="Data health" description="What needs fixing - each line links to the fix" />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {sections.map((s) => (
            <a
              key={s.key}
              href={`#${s.key}`}
              className={`rounded-xl border p-3 ${s.count ? "border-amber-200 bg-amber-50 hover:bg-amber-100" : "border-emerald-200 bg-emerald-50"}`}
            >
              <p className={`text-2xl font-semibold ${s.count ? "text-amber-800" : "text-emerald-700"}`}>{s.count}</p>
              <p className="text-xs text-slate-600">{s.label}</p>
            </a>
          ))}
        </div>

        <Card className="p-5" >
          <h2 id="dup" className="text-sm font-semibold text-slate-900 scroll-mt-24">Same invoice recorded twice</h2>
          <p className="mb-3 text-xs text-slate-500">Counted twice in sales, targets and incentives. Keep one and delete or correct the other (wrong number or company).</p>
          {duplicates.length === 0 ? (
            <p className="text-sm text-emerald-700">None.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className={th}>Invoice</th>
                  <th className={th}>Deal</th>
                  <th className={th}>Sales person</th>
                  <th className={th}>Company</th>
                  <th className={th}>Date</th>
                  <th className={`${th} text-right`}>Value</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.flatMap((group, gi) =>
                  group.map((d, i) => (
                    <tr key={d.id} className={i === 0 && gi > 0 ? "border-t-2 border-slate-200" : "border-t border-slate-100"}>
                      <td className="py-1.5 pr-3 font-medium text-slate-800">{i === 0 ? (d.invoiceNo ?? d.sourceTxnNo) : ""}</td>
                      <td className="py-1.5 pr-3">
                        <Link href={`/deals/${d.id}`} className={link}>
                          {d.title}
                        </Link>
                        {d.sourceTxnNo != null && <span className="ml-1 text-xs text-slate-400">(ERP upload)</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-600">{d.owner.name}</td>
                      <td className="py-1.5 pr-3 text-slate-600">{d.billingCompany ?? "Not recorded"}</td>
                      <td className="py-1.5 pr-3 text-slate-600">{d.closedAt ? formatDate(d.closedAt) : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-700">{formatCurrency(d.value)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <h2 id="won" className="text-sm font-semibold text-slate-900 scroll-mt-24">Won sales with details missing</h2>
          <p className="mb-3 text-xs text-slate-500">
            Entered in the CRM without the account, company, invoice no. or products. Open the deal: Edit for the account and company, Invoices &amp;
            products for the invoice and products (by hand or the Excel template).
          </p>
          {incompleteWon.length === 0 ? (
            <p className="text-sm text-emerald-700">None.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className={th}>Deal</th>
                  <th className={th}>Sales person</th>
                  <th className={th}>Won</th>
                  <th className={th}>Missing</th>
                  <th className={`${th} text-right`}>Value</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {incompleteWon.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3">
                      <Link href={`/deals/${d.id}`} className={link}>
                        {d.title}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">{d.owner.name}</td>
                    <td className="py-1.5 pr-3 text-slate-600">{d.closedAt ? formatDate(d.closedAt) : "—"}</td>
                    <td className="py-1.5 pr-3 text-amber-800">{missing(d)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-700">{formatCurrency(d.value)}</td>
                    <td className="py-1.5 whitespace-nowrap">
                      {(!d.accountId || !d.billingCompany) && (
                        <Link href={`/deals/${d.id}/edit`} className={`${link} mr-3`}>
                          Edit
                        </Link>
                      )}
                      {(!d.invoiceNo || d._count.items === 0) && (
                        <Link href={`/deals/${d.id}?markWon=1`} className={link}>
                          Invoices &amp; products
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card className="p-5">
            <h2 id="orphan" className="text-sm font-semibold text-slate-900 scroll-mt-24">Sales Register lines with no deal</h2>
            <p className="mb-3 text-xs text-slate-500">Left behind by deleted deals - no account, company or link. Open the month and use &quot;Delete lines with no deal&quot;.</p>
            {orphanLines.length === 0 ? (
              <p className="text-sm text-emerald-700">None.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {orphanLines.map((g) => (
                    <tr key={g.month.toISOString()} className="border-t border-slate-100">
                      <td className="py-1.5 pr-3">
                        <Link href={`/reports/sales-register?${monthParam(g.month)}`} className={link}>
                          {monthLabel(g.month)}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3 text-slate-600">
                        {g._count} line{g._count === 1 ? "" : "s"}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-700">{formatCurrency(g._sum.value ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card className="p-5">
            <h2 id="code" className="text-sm font-semibold text-slate-900 scroll-mt-24">Accounts with no customer code</h2>
            <p className="mb-3 text-xs text-slate-500">The ERP customer code links the account to its invoices in the Sales Register upload.</p>
            {noCode.length === 0 ? (
              <p className="text-sm text-emerald-700">None.</p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100 text-sm">
                  {noCode.map((a) => (
                    <li key={a.id} className="flex justify-between py-1.5">
                      <Link href={`/accounts/${a.id}/edit`} className={link}>
                        {a.name}
                      </Link>
                      <span className="text-slate-500">{a.owner.name}</span>
                    </li>
                  ))}
                </ul>
                {noCodeCount > noCode.length && <p className="mt-2 text-xs text-slate-500">…and {noCodeCount - noCode.length} more.</p>}
              </>
            )}
          </Card>

          <Card className="p-5">
            <h2 id="quiet" className="text-sm font-semibold text-slate-900 scroll-mt-24">Leads with no activity for {QUIET_DAYS}+ days</h2>
            <p className="mb-3 text-xs text-slate-500">Still open, with no call, email, meeting or task in the last {QUIET_DAYS} days. Follow up, convert or mark unqualified.</p>
            {quietLeads.length === 0 ? (
              <p className="text-sm text-emerald-700">None.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {quietLeads.slice(0, SHOW).map((l) => (
                  <li key={l.id} className="flex justify-between gap-3 py-1.5">
                    <Link href={`/leads/${l.id}`} className={`${link} truncate`}>
                      {l.title}
                    </Link>
                    <span className="whitespace-nowrap text-slate-500">
                      {l.owner.name} · {formatDate(l.createdAt)}
                    </span>
                  </li>
                ))}
                {quietLeads.length > SHOW && <li className="py-1.5 text-xs text-slate-500">…and {quietLeads.length - SHOW} more.</li>}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 id="close" className="text-sm font-semibold text-slate-900 scroll-mt-24">Open deals past their expected close</h2>
            <p className="mb-3 text-xs text-slate-500">Update the expected close date, move the stage on, or mark them won or lost.</p>
            {pastClose.length === 0 ? (
              <p className="text-sm text-emerald-700">None.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {pastClose.slice(0, SHOW).map((d) => (
                  <li key={d.id} className="flex justify-between gap-3 py-1.5">
                    <Link href={`/deals/${d.id}`} className={`${link} truncate`}>
                      {d.title}
                    </Link>
                    <span className="whitespace-nowrap text-slate-500">
                      {d.owner.name} · {formatDate(d.expectedCloseDate!)}
                    </span>
                  </li>
                ))}
                {pastClose.length > SHOW && <li className="py-1.5 text-xs text-slate-500">…and {pastClose.length - SHOW} more.</li>}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
