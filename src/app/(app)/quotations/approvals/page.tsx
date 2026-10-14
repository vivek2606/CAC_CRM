import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { ExcessLine } from "@/lib/quote-discount";
import { QuotationTabs } from "../quotation-tabs";
import { DecideButtons } from "./decide-buttons";

// Quotations held because a discount is over an item's permissible
// maximum - approve or reject; then the last few decided.
export default async function QuoteApprovalsPage() {
  await requireHead();
  const select = {
    id: true,
    ref: true,
    type: true,
    customerName: true,
    total: true,
    discountStatus: true,
    discountRequest: true,
    discountRequestedAt: true,
    discountDecidedAt: true,
    owner: { select: { name: true } },
    createdBy: { select: { name: true } },
    deal: { select: { id: true, title: true } },
  } as const;
  const [pending, decided] = await Promise.all([
    prisma.quotation.findMany({ where: { discountStatus: "pending" }, orderBy: { discountRequestedAt: "asc" }, select }),
    prisma.quotation.findMany({ where: { discountStatus: { in: ["approved", "rejected"] } }, orderBy: { discountDecidedAt: "desc" }, take: 20, select }),
  ]);
  const kind = { quote: "Quotation", proforma: "Proforma", boq: "BOQ" } as Record<string, string>;
  const lines = (q: (typeof pending)[number]) => (Array.isArray(q.discountRequest) ? (q.discountRequest as unknown as ExcessLine[]) : []);
  const th = "py-1.5 pr-3 font-medium";

  return (
    <div>
      <PageHeader title="Quotations" description="Quotes below the permissible discount, sent to you - only you can prepare them. Open one to prepare it, or approve it as it is" action={<QuotationTabs active="approvals" />} />
      <div className="p-6 space-y-4">
        {pending.length === 0 ? (
          <Card className="p-5">
            <EmptyState title="Nothing waiting for approval" description="When someone tries to make a quote below an item's Max Discount %, it is sent here." />
          </Card>
        ) : (
          pending.map((q) => (
            <Card key={q.id} className="p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {kind[q.type] ?? q.type} {q.ref} · {q.customerName}
                  </p>
                  <p className="text-xs text-slate-500">
                    For {q.owner.name}
                    {q.createdBy.name !== q.owner.name ? `, prepared by ${q.createdBy.name}` : ""}
                    {q.discountRequestedAt ? ` · asked ${formatDateTime(q.discountRequestedAt)}` : ""} · total {formatCurrency(q.total)}
                    {q.deal ? (
                      <>
                        {" · "}
                        <Link href={`/deals/${q.deal.id}`} className="text-indigo-600 hover:text-indigo-700">
                          {q.deal.title}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/quotations?quote=${q.id}`} className="text-sm text-indigo-600 hover:text-indigo-700">
                    Open &amp; prepare
                  </Link>
                  <DecideButtons quoteId={q.id} />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className={th}>Item</th>
                      <th className={`${th} text-right`}>Dealer&apos;s price</th>
                      <th className={`${th} text-right`}>Quoted (net)</th>
                      <th className={`${th} text-right`}>Discount</th>
                      <th className={`${th} text-right`}>Max allowed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines(q).map((l) => (
                      <tr key={l.productId} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3 text-slate-800">{l.description}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{formatCurrency(l.listRate)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{formatCurrency(l.netRate)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-rose-700">{l.discountPct}%</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{l.maxPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))
        )}

        {decided.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Recently decided</h2>
            <table className="w-full text-sm">
              <tbody>
                {decided.map((q) => (
                  <tr key={q.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 text-slate-800">
                      {kind[q.type] ?? q.type} {q.ref} · {q.customerName}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">{q.owner.name}</td>
                    <td className="py-1.5 pr-3 text-slate-600">{lines(q).map((l) => `${l.description} ${l.discountPct}%`).join(", ")}</td>
                    <td className={`py-1.5 pr-3 font-medium ${q.discountStatus === "approved" ? "text-emerald-700" : "text-rose-700"}`}>
                      {q.discountStatus === "approved" ? "Approved" : "Rejected"}
                    </td>
                    <td className="py-1.5 text-right text-slate-500 whitespace-nowrap">{q.discountDecidedAt ? formatDateTime(q.discountDecidedAt) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
