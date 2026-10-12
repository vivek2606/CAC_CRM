import Link from "next/link";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { LinkDealButton } from "./link-deal-button";

export type SavedQuoteRow = {
  id: string;
  ref: string;
  type: string;
  customerName: string;
  total: number;
  createdAt: Date;
  updatedAt: Date;
  owner: { name: string };
  createdBy: { name: string };
  deal: { id: string; title: string } | null;
};

const TYPE_LABEL: Record<string, string> = { quote: "Quotation", proforma: "Proforma", boq: "BOQ" };

// Saved quotations with links to download again, open, or revise (a revision
// gets a new reference number and keeps the deal link).
export function SavedQuotesTable({ quotes, showDeal = true }: { quotes: SavedQuoteRow[]; showDeal?: boolean }) {
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
              <td className="whitespace-nowrap text-right text-slate-800">{formatCurrency(q.total)}</td>
              <td className="whitespace-nowrap text-right">
                <span className="inline-flex items-center gap-2.5">
                  <a href={`/quotations/saved/${q.id}/pdf`} className={`${link} inline-flex items-center gap-1`} title="Download PDF">
                    <FileDown className="h-4 w-4" />
                    <span className="sr-only">PDF</span>
                  </a>
                  <a href={`/quotations/saved/${q.id}/xlsx`} className={`${link} inline-flex items-center gap-1`} title="Download Excel">
                    <FileSpreadsheet className="h-4 w-4" />
                    <span className="sr-only">Excel</span>
                  </a>
                  <Link href={`/quotations?quote=${q.id}&revise=1`} className={link} title="Copy into a new quotation with a new reference number">
                    Revise
                  </Link>
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
  owner: { select: { name: true } },
  createdBy: { select: { name: true } },
  deal: { select: { id: true, title: true } },
} as const;
