import Link from "next/link";
import { DeleteQuoteButton } from "./delete-quote-button";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { LinkDealButton } from "./link-deal-button";
import { UseQuoteProductsButton } from "./use-quote-products-button";

export type SavedQuoteRow = {
  id: string;
  ref: string;
  type: string;
  customerName: string;
  total: number;
  createdAt: Date;
  updatedAt: Date;
  discountStatus?: string | null;
  owner: { name: string };
  createdBy: { name: string };
  deal: { id: string; title: string } | null;
  // The account the "To" customer is (see attachAccounts).
  account?: { id: string; name: string } | null;
};

const TYPE_LABEL: Record<string, string> = { quote: "Quotation", proforma: "Proforma", boq: "BOQ" };

// Saved quotations with links to download again, open, or revise (a revision
// gets a new reference number and keeps the deal link).
// dealProducts: on a deal's page while it's in the pipeline - whether it has
// products already (each quote then gets "Use products").
export function SavedQuotesTable({
  quotes,
  showDeal = true,
  dealProducts,
  canExcel = true,
  canDelete = false,
  canSeeHistory = false,
}: {
  quotes: SavedQuoteRow[];
  showDeal?: boolean;
  dealProducts?: { hasProducts: boolean };
  // Not for the Sales Coordinator (PDF only).
  canExcel?: boolean;
  // The Head only.
  canDelete?: boolean;
  // The Head: each quotation's change history.
  canSeeHistory?: boolean;
}) {
  const link = "text-indigo-600 hover:text-indigo-500 font-medium";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="font-medium">Ref no.</th>
            <th className="font-medium">Date</th>
            <th className="font-medium">Type</th>
            <th className="font-medium">Customer</th>
            <th className="font-medium">Account</th>
            {showDeal && <th className="font-medium">Deal</th>}
            <th className="font-medium">Sales person</th>
            <th className="font-medium text-right">Amount</th>
            <th className="font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id} className="border-b border-slate-100 last:border-0">
              <td className="whitespace-nowrap font-medium text-slate-800">
                <Link href={`/quotations?quote=${q.id}`} className="hover:text-indigo-600">
                  {q.ref}
                </Link>
              </td>
              <td className="whitespace-nowrap text-slate-600" title={`Last downloaded ${formatDate(q.updatedAt)}`}>
                {formatDate(q.createdAt)}
              </td>
              <td className="text-slate-600">{TYPE_LABEL[q.type] ?? q.type}</td>
              <td className="text-slate-700 max-w-[170px] truncate" title={q.customerName}>{q.customerName || "—"}</td>
              <td className="max-w-[170px] truncate" title={q.account?.name}>
                {q.account ? (
                  <Link href={`/accounts/${q.account.id}`} className={link}>
                    {q.account.name}
                  </Link>
                ) : (
                  <span className="text-xs text-slate-400">Not linked</span>
                )}
              </td>
              {showDeal && (
                <td className="max-w-[170px] truncate" title={q.deal?.title}>
                  {q.deal ? (
                    <Link href={`/deals/${q.deal.id}`} className={link}>
                      {q.deal.title}
                    </Link>
                  ) : (
                    <LinkDealButton quoteId={q.id} quoteRef={q.ref} ownerName={q.owner.name} />
                  )}
                </td>
              )}
              <td
                className="max-w-[130px] truncate text-slate-600"
                title={q.createdBy.name !== q.owner.name ? `${q.owner.name} - prepared by ${q.createdBy.name}` : q.owner.name}
              >
                {q.owner.name}
              </td>
              <td className="whitespace-nowrap text-right text-slate-800">
                {formatCurrency(q.total)}
                {q.discountStatus && (
                  <div
                    className={`text-xs font-medium ${q.discountStatus === "approved" ? "text-emerald-700" : q.discountStatus === "rejected" ? "text-rose-700" : "text-amber-700"}`}
                    title="Discount over the permissible maximum"
                  >
                    {q.discountStatus === "approved" ? "Discount approved" : q.discountStatus === "rejected" ? "Discount rejected" : "Discount awaiting approval"}
                  </div>
                )}
              </td>
              <td className="whitespace-nowrap text-right">
                <span className="inline-flex items-center gap-2.5">
                  <a href={`/quotations/saved/${q.id}/pdf`} className={`${link} inline-flex items-center gap-1`} title="Download PDF">
                    <FileDown className="h-4 w-4" />
                    <span className="sr-only">PDF</span>
                  </a>
                  {canExcel && (
                    <a href={`/quotations/saved/${q.id}/xlsx`} className={`${link} inline-flex items-center gap-1`} title="Download Excel">
                      <FileSpreadsheet className="h-4 w-4" />
                      <span className="sr-only">Excel</span>
                    </a>
                  )}
                  <Link href={`/quotations?quote=${q.id}&revise=1`} className={link} title="Copy into a new quotation with a new reference number">
                    Revise
                  </Link>
                  {dealProducts && <UseQuoteProductsButton quoteId={q.id} hasProducts={dealProducts.hasProducts} />}
                  {canSeeHistory && (
                    <Link href={`/quotations/history/${q.id}`} className={link} title="Who changed this quotation, what and when">
                      History
                    </Link>
                  )}
                  {canDelete && <DeleteQuoteButton quoteId={q.id} quoteRef={q.ref} />}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const savedQuoteSelect = {
  id: true,
  ref: true,
  type: true,
  customerName: true,
  total: true,
  createdAt: true,
  updatedAt: true,
  discountStatus: true,
  owner: { select: { name: true } },
  createdBy: { select: { name: true } },
  deal: { select: { id: true, title: true } },
  data: true,
} as const;
