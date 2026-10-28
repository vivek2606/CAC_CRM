import { prisma } from "@/lib/prisma";
import { requireUser, isBackOffice } from "@/lib/rbac";
import { getStudioViews } from "@/lib/studio-views";
import { PageHeader } from "@/components/ui";
import { SalesRegisterTable, PeriodFields, type RegisterRow } from "./register-table";
import { InvoiceEntry } from "../../deals/invoice-entry";
import { DeletePeriodSalesButton } from "./delete-period-sales-button";
import { DeleteOrphanLinesButton } from "./delete-orphan-lines-button";
import { clearOrphanCrmLines } from "../../deals/actions";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";
import { ResyncCategoryButton } from "../resync-category-button";
import { RegisterTabs } from "@/components/register-tabs";

// Line-by-line sales register: every product line sold (from the Sales
// Register import and deals won in the CRM) plus Project & Service billing,
// for a chosen period, sales person and product type. Sales managers see
// their own lines; the Head and Sales Coordinator see everyone's.

const MAX_ROWS = 10000;

function parseDate(raw: string | undefined): Date | null {
  const m = raw?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

// Invoice no. from an imported line's key: "<docKey>-<itemCode>-<n>", docKey
// being "<Txn Code>/<Txn No>" (optionally "~date~customer~salesman").
function invoiceFromKey(sourceKey: string, itemCode: string): string | null {
  if (sourceKey.startsWith("deal-item:") || sourceKey.startsWith("manual:") || sourceKey.startsWith("upload:")) return null;
  const suffix = `-${itemCode}-`;
  const at = sourceKey.lastIndexOf(suffix);
  const docKey = (at > 0 ? sourceKey.slice(0, at) : sourceKey).split("~")[0];
  const no = docKey.split("/").pop();
  return no && /\d/.test(no) ? no : null;
}

export default async function SalesRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; rep?: string; category?: string; company?: string }>;
}) {
  const user = await requireUser();
  const all = isBackOffice(user);
  const params = await searchParams;
  const description = all ? "Every invoice line - filter by period, sales person, product type and company" : "Your invoice lines - filter by period, product type and company";

  // Default period: the start of this month to today.
  const now = new Date();
  const defFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const defTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = parseDate(params.from) ?? defFrom;
  const to = parseDate(params.to) ?? defTo;
  const end = new Date(to.getTime() + 86400000);

  const people = all
    ? await prisma.user.findMany({
        where: { OR: [{ isActive: true, title: { in: ["Sales Manager", "Service Manager"] } }] },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];
  const repId = all ? (people.some((p) => p.id === params.rep) ? params.rep! : null) : user.id;
  const ownerWhere = repId ? { ownerId: repId } : {};
  const category = params.category || null;
  // Billing company: Sakuragi / Somotex, or "none" for lines without one.
  const company = params.company === "Sakuragi" || params.company === "Somotex" || params.company === "none" ? params.company : null;
  const lineCompanyWhere =
    company === "none" ? { OR: [{ dealId: null }, { deal: { billingCompany: null } }] } : company ? { deal: { billingCompany: company } } : {};
  const dealCompanyWhere = company === "none" ? { billingCompany: null } : company ? { billingCompany: company } : {};

  // Lines left behind by deals deleted before deleting took them along.
  await clearOrphanCrmLines();

  const [lines, billings, categories] = await Promise.all([
    category === "Project & Service" || category === "No products listed"
      ? Promise.resolve([])
      : prisma.saleLineItem.findMany({
          where: { docDate: { gte: from, lt: end }, ...ownerWhere, ...lineCompanyWhere, ...(category ? { product: { category } } : {}) },
          orderBy: [{ docDate: "desc" }],
          take: MAX_ROWS,
          select: {
            id: true,
            docDate: true,
            qty: true,
            value: true,
            sourceKey: true,
            owner: { select: { name: true } },
            product: { select: { code: true, model: true, category: true } },
            deal: { select: { id: true, sourceTxnNo: true, invoiceNo: true, title: true, billingCompany: true, account: { select: { name: true, code: true } } } },
          },
        }),
    category && category !== "Project & Service"
      ? Promise.resolve([])
      : prisma.projectBilling.findMany({
          where: { docDate: { gte: from, lt: end }, ...ownerWhere, ...dealCompanyWhere },
          orderBy: [{ docDate: "desc" }],
          take: MAX_ROWS,
          select: { id: true, docDate: true, value: true, txnNo: true, docKey: true, sourceKey: true, custName: true, itemCode: true, itemName: true, billingCompany: true, owner: { select: { name: true } } },
        }),
    prisma.product.findMany({ distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
  ]);

  // Deals won in the CRM with no product lines still belong in the register -
  // one line at the deal's value.
  const bareDeals =
    category && category !== "No products listed"
      ? []
      : await prisma.deal.findMany({
          where: { stage: "WON", sourceTxnNo: null, closedAt: { gte: from, lt: end }, items: { none: {} }, lineItems: { none: {} }, ...ownerWhere, ...dealCompanyWhere },
          take: MAX_ROWS,
          select: { id: true, title: true, value: true, closedAt: true, invoiceNo: true, billingCompany: true, owner: { select: { name: true } }, account: { select: { name: true, code: true } } },
        });

  // Monthly targets for the months the period touches (whole months), for
  // the chart studio's target values.
  const targetRows = await prisma.target.findMany({
    where: {
      month: { gte: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)), lt: end },
      ...(repId ? { userId: repId } : {}),
    },
    select: { month: true, targetValue: true, user: { select: { name: true } } },
  });
  const targets = targetRows.map((t) => ({ salesPerson: t.user.name, month: t.month.toISOString().slice(0, 7), value: t.targetValue }));

  // Account codes for project billing lines (they carry the customer name only).
  const custNames = [...new Set(billings.map((b) => b.custName))];
  const accounts = custNames.length
    ? await prisma.account.findMany({ where: { name: { in: custNames } }, select: { name: true, code: true } })
    : [];
  const codeByName = new Map(accounts.map((a) => [a.name, a.code]));

  const rows: RegisterRow[] = [
    ...lines.map((l) => ({
      id: l.id,
      accountName: l.deal?.account?.name ?? l.deal?.title.split(" — ")[0] ?? "—",
      accountCode: l.deal?.account?.code ?? "",
      salesPerson: l.owner.name,
      productCode: l.product.code,
      product: l.product.model,
      category: l.product.category,
      qty: l.qty,
      rate: l.qty ? Math.round((l.value / l.qty) * 100) / 100 : l.value,
      amount: l.value,
      invoiceNo:
        l.deal?.sourceTxnNo != null ? String(l.deal.sourceTxnNo) : (l.deal?.invoiceNo ?? invoiceFromKey(l.sourceKey, l.product.code) ?? ""),
      invoiceDate: iso(l.docDate),
      company: l.deal?.billingCompany ?? "Not recorded",
      dealId: l.deal?.id ?? null,
      accountLinked: !l.deal || !!l.deal.account,
    })),
    ...bareDeals.map((d) => ({
      id: d.id,
      accountName: d.account?.name ?? d.title,
      accountCode: d.account?.code ?? "",
      salesPerson: d.owner.name,
      productCode: "",
      product: d.title,
      category: "No products listed",
      qty: 1,
      rate: d.value,
      amount: d.value,
      invoiceNo: d.invoiceNo ?? "",
      invoiceDate: iso(d.closedAt!),
      company: d.billingCompany ?? "Not recorded",
      dealId: d.id,
      accountLinked: !!d.account,
    })),
    ...billings.map((b) => ({
      id: b.id,
      accountName: b.custName,
      accountCode: codeByName.get(b.custName) ?? "",
      salesPerson: b.owner.name,
      productCode: b.itemCode,
      product: b.itemName,
      category: "Project & Service",
      qty: 1,
      rate: b.value,
      amount: b.value,
      invoiceNo: b.txnNo ? String(b.txnNo) : b.docKey,
      invoiceDate: iso(b.docDate),
      company: b.billingCompany ?? "Not recorded",
      dealId: null,
      billingId: b.id,
      accountLinked: codeByName.has(b.custName),
    })),
  ];
  // Accounts to link unlinked lines to (Head / Coordinator only).
  const linkAccounts =
    all && rows.some((r) => r.accountLinked === false)
      ? (await prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } })).map((a) => ({
          id: a.id,
          label: a.code ? `${a.name} (${a.code})` : a.name,
        }))
      : [];
  // Deals won in the CRM before the invoice was asked for.
  const missingInvoice = await prisma.deal.findMany({
    // Won in the CRM with the invoice no. or the products billed missing.
    where: { stage: "WON", sourceTxnNo: null, OR: [{ invoiceNo: null }, { items: { none: {} } }], ...(all ? {} : { ownerId: user.id }) },
    orderBy: { closedAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      value: true,
      closedAt: true,
      invoiceNo: true,
      billingCompany: true,
      accountId: true,
      _count: { select: { items: true } },
      owner: { select: { name: true } },
      account: { select: { name: true } },
    },
  });

  // Head, one sales person picked: the sales they entered in the CRM in the
  // period, which can be cleared in one go and entered again.
  const crmSales =
    user.role === "HEAD" && repId
      ? await prisma.deal.aggregate({
          where: { ownerId: repId, stage: "WON", sourceTxnNo: null, closedAt: { gte: from, lt: end } },
          _count: true,
          _sum: { value: true },
        })
      : null;

  // Head: lines with no deal behind them (no account, company or link).
  const orphanLines =
    user.role === "HEAD"
      ? await prisma.saleLineItem.aggregate({
          where: { dealId: null, docDate: { gte: from, lt: end }, ...ownerWhere },
          _count: true,
          _sum: { value: true },
        })
      : null;

  const truncated = lines.length >= MAX_ROWS || billings.length >= MAX_ROWS;
  const categoryOptions = [...categories.map((c) => c.category).filter((c) => c !== "Project & Service"), "Project & Service", "No products listed"];

  // The period / sales person / type / entity filters: down the chart
  // studio's side panel, or a row above the table when the studio is hidden.
  const filterForm = (vertical: boolean) => (
        <form key={vertical ? "side" : "row"} className={vertical ? "flex flex-col items-stretch gap-2 [&_input]:w-full [&_select]:w-full" : "flex flex-wrap items-end gap-3"} action="/reports/sales-register">
          <PeriodFields from={iso(from)} to={iso(to)} />
          {all && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Sales person</label>
              <select name="rep" defaultValue={repId ?? ""} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="">Everyone</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Product type</label>
            <select name="category" defaultValue={category ?? ""} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">All types</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Entity</label>
            <select name="company" defaultValue={company ?? ""} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">Both companies</option>
              <option value="Sakuragi">Sakuragi</option>
              <option value="Somotex">Somotex</option>
              <option value="none">Not recorded</option>
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Show
          </button>
        </form>
  );

  return (
    <div>
      <PageHeader title="Sales Register" description={description} />
      <div className="p-4 space-y-3">
        <RegisterTabs active="lines" />
        {((crmSales && crmSales._count > 0 && repId) || (orphanLines && orphanLines._count > 0)) && (
          <div className="flex flex-wrap justify-end gap-2">
            {orphanLines && orphanLines._count > 0 && (
              <DeleteOrphanLinesButton
                ownerId={repId}
                from={iso(from)}
                to={iso(to)}
                count={orphanLines._count}
                total={formatCurrency(orphanLines._sum.value ?? 0)}
              />
            )}
            {crmSales && crmSales._count > 0 && repId && (
            <DeletePeriodSalesButton
              ownerId={repId}
              ownerName={people.find((p) => p.id === repId)?.name ?? "This sales person"}
              from={iso(from)}
              to={iso(to)}
              count={crmSales._count}
              total={formatCurrency(crmSales._sum.value ?? 0)}
            />
            )}
          </div>
        )}
        {all && (
          <div className="flex justify-end">
            <ResyncCategoryButton />
          </div>
        )}
        {missingInvoice.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50">
            <div className="px-4 pt-3 pb-2">
              <p className="text-sm font-semibold text-amber-900">
                {missingInvoice.length} won deal{missingInvoice.length === 1 ? "" : "s"} with details missing
              </p>
              <p className="text-xs text-amber-800">
                Marked Won without the invoice no. or the products billed. Add the invoice no. and date here, or press Fix to enter the invoices and
                products (by hand or with the Excel template) - the invoice date is when the sale counts.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-amber-100">
                  {missingInvoice.map((d) => (
                    <tr key={d.id}>
                      <td className="px-4 py-1.5">
                        <Link href={`/deals/${d.id}`} className="font-medium text-indigo-700 hover:underline">
                          {d.account?.name ?? d.title}
                        </Link>
                        <div className="text-[11px] text-slate-500">{d.title}</div>
                      </td>
                      {all && <td className="px-2 py-1.5 whitespace-nowrap text-slate-700">{d.owner.name}</td>}
                      <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">Won {d.closedAt ? formatDate(d.closedAt) : ""}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-right tabular-nums text-slate-700">{formatCurrency(d.value)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-amber-800">
                        {[!d.invoiceNo && "No invoice no.", d._count.items === 0 && "No products"].filter(Boolean).join(" · ")}
                        {!d.accountId && (
                          <Link href={`/deals/${d.id}/edit`} className="ml-1 font-medium text-indigo-700 hover:underline">
                            No account - link it
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-1.5">
                        {d._count.items === 0 ? (
                          all ? (
                            <Link href={`/deals/${d.id}?markWon=1`} className="font-medium text-indigo-700 hover:underline">
                              Fix
                            </Link>
                          ) : (
                            <span className="text-slate-500">Ask the Sales Coordinator to add the products</span>
                          )
                        ) : (
                          <InvoiceEntry dealId={d.id} closedAt={(d.closedAt ?? new Date()).toISOString().slice(0, 10)} billingCompany={d.billingCompany} compact />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {truncated && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            Showing the first {MAX_ROWS.toLocaleString()} lines - narrow the period or filters to see everything.
          </p>
        )}
        <SalesRegisterTable rows={rows} filename={`sales-register-${iso(from)}-to-${iso(to)}.csv`} showSalesPerson={all} canEditCompany={all} canEditDate={user.role === "HEAD"} accounts={linkAccounts} pageFilters={filterForm(false)} sidePageFilters={filterForm(true)} targets={targets} views={await getStudioViews("register", user.id)} />
      </div>
    </div>
  );
}
