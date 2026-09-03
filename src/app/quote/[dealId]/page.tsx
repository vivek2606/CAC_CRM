import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { formatCurrency, formatDate } from "@/lib/format";
import { COMPANY_PROFILE } from "@/lib/company-profile";
import { PrintButton } from "./print-button";

export default async function QuotePage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const user = await requireUser();

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      owner: { select: { name: true, phone: true, email: true } },
      account: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: { product: { select: { code: true, model: true, category: true } } },
      },
    },
  });

  if (!deal) notFound();
  if (!canAccessOwner(user, deal.ownerId)) redirect("/deals");
  // A quote needs a number (assigned by viewQuote()) and line items to show
  // - if either is missing, this route was reached some other way; send
  // back to the deal instead of rendering an empty document.
  if (!deal.quoteNumber || deal.items.length === 0) redirect(`/deals/${deal.id}`);

  const total = deal.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const quoteCode = `Q-${String(deal.quoteNumber).padStart(4, "0")}`;
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + COMPANY_PROFILE.quoteValidityDays);

  const customerLabel =
    deal.customerName ?? (deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName}` : "—");

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="max-w-3xl mx-auto py-8 px-4 print:p-0 print:max-w-none">
        <PrintButton dealId={deal.id} />

        <div className="bg-white rounded-xl shadow-sm print:shadow-none print:rounded-none p-8 print:p-0 text-slate-900">
          <div className="flex justify-between items-start border-b border-slate-200 pb-6 mb-6">
            <div>
              <h1 className="text-lg font-bold">{COMPANY_PROFILE.name}</h1>
              {COMPANY_PROFILE.addressLines.map((line) => (
                <p key={line} className="text-xs text-slate-500">
                  {line}
                </p>
              ))}
              {COMPANY_PROFILE.phone && <p className="text-xs text-slate-500">{COMPANY_PROFILE.phone}</p>}
              {COMPANY_PROFILE.email && <p className="text-xs text-slate-500">{COMPANY_PROFILE.email}</p>}
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold tracking-wide">QUOTATION</h2>
              <p className="text-xs text-slate-500 mt-1">{quoteCode}</p>
              <p className="text-xs text-slate-500">Date: {formatDate(new Date())}</p>
              <p className="text-xs text-slate-500">Valid until: {formatDate(validUntil)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400 mb-1">Quotation for</p>
              <p className="font-medium">{customerLabel}</p>
              {deal.account && <p className="text-slate-600">{deal.account.name}</p>}
              {deal.customerPhone && <p className="text-slate-600">{deal.customerPhone}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400 mb-1">Prepared by</p>
              <p className="font-medium">{deal.owner.name}</p>
              {deal.owner.phone && <p className="text-slate-600">{deal.owner.phone}</p>}
              {deal.owner.email && <p className="text-slate-600">{deal.owner.email}</p>}
            </div>
          </div>

          <p className="text-sm text-slate-700 mb-4">
            <span className="font-medium">Re:</span> {deal.title}
          </p>

          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="border-b-2 border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2 w-8">#</th>
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 px-2 text-right">Qty</th>
                <th className="py-2 px-2 text-right">Unit Price</th>
                <th className="py-2 pl-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {deal.items.map((item, i) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-2 pr-2 text-slate-500">{i + 1}</td>
                  <td className="py-2 pr-2">
                    {item.product.model}
                    <span className="block text-xs text-slate-400">
                      {item.product.code} · {item.product.category}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right text-slate-600">{item.qty}</td>
                  <td className="py-2 px-2 text-right text-slate-600">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-2 pl-2 text-right font-medium">{formatCurrency(item.qty * item.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="pt-3 text-right font-semibold text-slate-700">
                  Total
                </td>
                <td className="pt-3 text-right font-bold">{formatCurrency(total)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="text-xs text-slate-500 space-y-1 border-t border-slate-200 pt-4">
            <p>
              <span className="font-medium text-slate-600">Payment terms:</span> {COMPANY_PROFILE.paymentTerms}
            </p>
            <p>
              <span className="font-medium text-slate-600">Validity:</span> {COMPANY_PROFILE.quoteValidityDays} days
              from date of issue.
            </p>
            {COMPANY_PROFILE.bankDetails && (
              <p>
                <span className="font-medium text-slate-600">Bank details:</span> {COMPANY_PROFILE.bankDetails.bankName}{" "}
                · {COMPANY_PROFILE.bankDetails.accountName} · {COMPANY_PROFILE.bankDetails.accountNumber}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
