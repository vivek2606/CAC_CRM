import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { getCompanySettings } from "@/lib/company-profile";
import { serviceInvoiceInputSchema, buildServiceInvoice, SOMOTEX, SOMOTEX_VAT_REG_NO, SOMOTEX_BANK_BRANCH } from "@/lib/service-invoice";
import { SERVICE_INVOICE_DRAFT_PREFIX } from "@/lib/service-invoice-schema";
import { InvoiceBuilder, type InvoicePrefill } from "./invoice-builder";
import { DiscardInvoiceDraftButton } from "./discard-draft-button";

// Service & project invoices under Somotex Nigeria Limited: prepare one
// (free-text lines, with or without VAT, payment received and balance),
// and the ones saved so far - download again, or open to change.
export default async function ServiceInvoicePage({ searchParams }: { searchParams: Promise<{ id?: string; copy?: string; draft?: string }> }) {
  const user = await requireBackOffice();
  const { id, copy, draft } = await searchParams;
  const isDraft = { ref: { startsWith: SERVICE_INVOICE_DRAFT_PREFIX } };
  const [settings, me, saved, drafts] = await Promise.all([
    getCompanySettings(),
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, title: true, phone: true } }),
    prisma.serviceInvoice.findMany({ where: { NOT: isDraft }, orderBy: { createdAt: "desc" }, take: 200, include: { createdBy: { select: { name: true } } } }),
    prisma.serviceInvoice.findMany({ where: isDraft, orderBy: { updatedAt: "desc" }, take: 100, include: { createdBy: { select: { name: true } } } }),
  ]);

  // Opened from the list: that invoice (same number), a copy as a new one,
  // or a draft (with the number it was saved with, if any).
  let prefill: InvoicePrefill | null = null;
  let draftId: string | null = null;
  const openId = id ?? copy ?? draft;
  if (openId) {
    const row = await prisma.serviceInvoice.findUnique({ where: { id: openId } });
    const parsed = row ? serviceInvoiceInputSchema.safeParse(row.data) : null;
    if (row && parsed?.success) {
      const rowIsDraft = row.ref.startsWith(SERVICE_INVOICE_DRAFT_PREFIX);
      prefill = { ...parsed.data, ref: copy ? "" : rowIsDraft ? parsed.data.ref : row.ref };
      if (rowIsDraft && !copy) draftId = row.id;
    }
  }
  const rows = await Promise.all(
    saved.map(async (r) => {
      const parsed = serviceInvoiceInputSchema.safeParse(r.data);
      const doc = parsed.success ? await buildServiceInvoice(parsed.data) : null;
      return { ...r, type: parsed.success ? parsed.data.billingType : "-", received: doc?.payment?.received ?? 0, balance: doc?.payment?.balance ?? r.total, date: parsed.success ? parsed.data.date : null };
    }),
  );
  const link = "text-indigo-600 hover:text-indigo-500 font-medium";

  return (
    <div>
      <PageHeader
        title="Service & Project Invoice"
        description={`Issued under ${SOMOTEX.name} - VAT Reg. No. ${SOMOTEX_VAT_REG_NO}, TIN ${SOMOTEX.tin}, ${SOMOTEX.bankName} (${SOMOTEX_BANK_BRANCH}) ${SOMOTEX.accountNumber}`}
        action={
          <Link href="/project-billing" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← Project &amp; Service Billing
          </Link>
        }
      />
      <div className="p-6 space-y-6">
        <InvoiceBuilder
          key={`${openId ?? "new"}-${copy ? "copy" : ""}`}
          prefill={prefill}
          draftId={draftId}
          vatRatePct={settings.vatRatePct}
          defaultTerms={["Payment is due on receipt of this invoice.", "Please quote the invoice number with your payment."]}
          signatory={{ name: me?.name ?? "", designation: me?.title ?? "", phone: me?.phone ?? "" }}
        />

        {drafts.length > 0 && (
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Drafts - saved, not downloaded yet ({drafts.length})</h2>
            <p className="mb-3 text-xs text-slate-500">Open one to finish it; a new invoice gets its number when downloaded.</p>
            <table className="w-full text-sm">
              <tbody>
                {drafts.map((r) => {
                  const ref = (r.data as { ref?: string } | null)?.ref ?? "";
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-medium text-slate-800">
                        {r.customerName || "No customer yet"}
                        {ref && <span className="ml-2 text-xs font-normal text-slate-500">changes to {ref}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.total)}</td>
                      <td className="px-2 py-1.5 text-slate-600">{r.createdBy.name}</td>
                      <td className="px-2 py-1.5 text-xs text-slate-500 whitespace-nowrap">Saved {formatDateTime(r.updatedAt)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap space-x-3 text-right">
                        <Link href={`/project-billing/invoice?draft=${r.id}`} className={link}>
                          Open
                        </Link>
                        <DiscardInvoiceDraftButton id={r.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Saved invoices ({rows.length})</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">None yet - each invoice is saved when it is downloaded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide">
                    <th className="px-2 py-1.5 font-medium">Invoice no.</th>
                    <th className="px-2 py-1.5 font-medium">Date</th>
                    <th className="px-2 py-1.5 font-medium">Type</th>
                    <th className="px-2 py-1.5 font-medium">Customer</th>
                    <th className="px-2 py-1.5 text-right font-medium">Total</th>
                    <th className="px-2 py-1.5 text-right font-medium">Received</th>
                    <th className="px-2 py-1.5 text-right font-medium">Balance</th>
                    <th className="px-2 py-1.5 font-medium">By</th>
                    <th className="px-2 py-1.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 whitespace-nowrap font-medium text-slate-800">{r.ref}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{r.date ? formatDate(new Date(`${r.date}T00:00:00Z`)) : "-"}</td>
                      <td className="px-2 py-1.5 text-slate-600">{r.type}</td>
                      <td className="px-2 py-1.5 text-slate-700 max-w-[220px] truncate" title={r.customerName}>
                        {r.customerName}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.total)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{formatCurrency(r.received)}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${r.balance > 0.005 ? "text-amber-700" : "text-emerald-700"}`}>{formatCurrency(r.balance)}</td>
                      <td className="px-2 py-1.5 text-slate-600">{r.createdBy.name}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap space-x-3 text-right">
                        <a href={`/project-billing/invoice/${r.id}/pdf`} className={link}>
                          PDF
                        </a>
                        <Link href={`/project-billing/invoice?id=${r.id}`} className={link} title="Open to change (payment received, lines…) - keeps this number">
                          Open
                        </Link>
                        <Link href={`/project-billing/invoice?copy=${r.id}`} className={link} title="Copy into a new invoice with a new number">
                          Copy
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
