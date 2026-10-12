import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, isBackOffice } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { visibleQuotationsWhere } from "@/lib/saved-quotes";
import { SavedQuotesTable, savedQuoteSelect } from "../saved-quotes-table";
import { QuotationTabs } from "../quotation-tabs";

// Every quotation downloaded from the builder, newest first.
export default async function SavedQuotationsPage({ searchParams }: { searchParams: Promise<{ q?: string; rep?: string }> }) {
  const user = await requireUser();
  const { q = "", rep = "" } = await searchParams;
  const backOffice = isBackOffice(user);
  const term = q.trim();
  const where: Prisma.QuotationWhereInput = {
    AND: [
      visibleQuotationsWhere(user),
      term
        ? {
            OR: [
              { ref: { contains: term, mode: "insensitive" } },
              { customerName: { contains: term, mode: "insensitive" } },
              { deal: { title: { contains: term, mode: "insensitive" } } },
            ],
          }
        : {},
      backOffice && rep ? { createdById: rep } : {},
    ],
  };
  const [quotes, total, reps] = await Promise.all([
    prisma.quotation.findMany({ where, orderBy: { createdAt: "desc" }, take: 300, select: savedQuoteSelect }),
    prisma.quotation.count({ where }),
    backOffice ? prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
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
          <button type="submit" className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3.5 py-2">
            Search
          </button>
          {(term || rep) && (
            <Link href="/quotations/saved" className="text-sm text-slate-500 hover:text-slate-800 py-2">
              Clear
            </Link>
          )}
        </form>
        <Card className="p-4">
          {quotes.length === 0 ? (
            <EmptyState title="No saved quotations" description="A quotation is saved here the first time it's downloaded." />
          ) : (
            <>
              <SavedQuotesTable quotes={quotes} />
              {total > quotes.length && <p className="mt-3 text-xs text-slate-500">Showing the latest {quotes.length} of {total} - search to narrow down.</p>}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
