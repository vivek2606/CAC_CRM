import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, isBackOffice, canDownloadQuoteExcel } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { visibleQuotationsWhere, quoteSalesPeople, NOT_DRAFT, DRAFT_TYPE, attachAccounts } from "@/lib/saved-quotes";
import { formatDateTime } from "@/lib/format";
import { DiscardDraftButton } from "./discard-draft-button";
import { SavedQuotesTable, savedQuoteSelect } from "../saved-quotes-table";
import { QuotationTabs } from "../quotation-tabs";
import { isIssuedQuoteRef } from "@/lib/document-format";

// Every quotation downloaded from the builder, newest first.
export default async function SavedQuotationsPage({ searchParams }: { searchParams: Promise<{ q?: string; rep?: string; unlinked?: string }> }) {
  const user = await requireUser();
  const { q = "", rep = "", unlinked = "" } = await searchParams;
  const backOffice = isBackOffice(user);
  const term = q.trim();
  const where: Prisma.QuotationWhereInput = {
    AND: [
      visibleQuotationsWhere(user),
      NOT_DRAFT,
      term
        ? {
            OR: [
              { ref: { contains: term, mode: "insensitive" } },
              { customerName: { contains: term, mode: "insensitive" } },
              { deal: { title: { contains: term, mode: "insensitive" } } },
            ],
          }
        : {},
      backOffice && rep ? { ownerId: rep } : {},
      unlinked === "1" ? { dealId: null } : {},
    ],
  };
  // Saved but not downloaded yet.
  const drafts = await prisma.quotation.findMany({
    where: { AND: [visibleQuotationsWhere(user), { type: DRAFT_TYPE }] },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, customerName: true, updatedAt: true, data: true, owner: { select: { name: true } }, createdBy: { select: { name: true } } },
  });
  const [quotes, total, reps] = await Promise.all([
    prisma.quotation.findMany({ where, orderBy: { createdAt: "desc" }, take: 300, select: savedQuoteSelect }).then(attachAccounts),
    prisma.quotation.count({ where }),
    backOffice ? quoteSalesPeople() : Promise.resolve([]),
  ]);
  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";

  return (
    <div>
      <PageHeader title="Quotations" description="Saved quotations - download again, or revise into a new one" action={<QuotationTabs active="saved" />} />
      <div className="p-6 space-y-4">
        <form className="flex flex-wrap items-end gap-3" action="/quotations/saved">
          <input name="q" defaultValue={term} placeholder="Ref no., customer or deal" className={`${field} w-64`} />
          {backOffice && (
            <select name="rep" defaultValue={rep} className={field}>
              <option value="">All sales people</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2 py-2 text-sm text-slate-600">
            <input type="checkbox" name="unlinked" value="1" defaultChecked={unlinked === "1"} className="rounded border-slate-300" />
            Not linked to a deal
          </label>
          <button type="submit" className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3.5 py-2">
            Search
          </button>
          {(term || rep || unlinked) && (
            <Link href="/quotations/saved" className="text-sm text-slate-500 hover:text-slate-800 py-2">
              Clear
            </Link>
          )}
        </form>
        {drafts.length > 0 && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-slate-900">Drafts - saved, not downloaded yet</h2>
            <p className="mb-2 text-xs text-slate-500">Open one to finish it; it gets its quotation number when downloaded (changes to an issued quotation keep its number).</p>
            <table className="w-full text-sm">
              <tbody>
                {drafts.map((q) => {
                  const kind = { quote: "Quotation", proforma: "Proforma", boq: "BOQ" }[(q.data as { type?: string } | null)?.type ?? ""] ?? "Quotation";
                  return (
                    <tr key={q.id} className="border-t border-slate-100">
                      <td className="py-1.5 pr-3 text-slate-600">{kind}</td>
                      <td className="py-1.5 pr-3 font-medium text-slate-800">
                        {q.customerName || "No customer yet"}
                        {(() => {
                          const ref = (q.data as { ref?: string } | null)?.ref ?? "";
                          return isIssuedQuoteRef(ref) ? <span className="ml-2 text-xs font-normal text-slate-500">changes to {ref}</span> : null;
                        })()}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-600">
                        {q.owner.name}
                        {q.createdBy.name !== q.owner.name ? ` (by ${q.createdBy.name})` : ""}
                      </td>
                      <td className="py-1.5 pr-3 text-xs text-slate-500 whitespace-nowrap">Saved {formatDateTime(q.updatedAt)}</td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        <Link href={`/quotations?draft=${q.id}`} className="mr-3 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                          Open
                        </Link>
                        <DiscardDraftButton id={q.id} label={q.customerName || "this quotation"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
        <Card className="p-4">
          {quotes.length === 0 ? (
            <EmptyState title="No saved quotations" description="A quotation is saved here the first time it's downloaded." />
          ) : (
            <>
              <SavedQuotesTable quotes={quotes} canExcel={canDownloadQuoteExcel(user)} canDelete={user.role === "HEAD"} canSeeHistory={user.role === "HEAD"} />
              {total > quotes.length && <p className="mt-3 text-xs text-slate-500">Showing the latest {quotes.length} of {total} - search to narrow down.</p>}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
