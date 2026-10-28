import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { HistoryCard } from "@/components/history-card";
import { formatCurrency, formatDate } from "@/lib/format";

// A quotation's full change history (the Head): every save, download,
// change of lines / rates / discounts, deal link and approval - also for
// a quotation since deleted.
export default async function QuoteHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireHead();
  const { id } = await params;
  const q = await prisma.quotation.findUnique({
    where: { id },
    select: { ref: true, type: true, customerName: true, total: true, createdAt: true, owner: { select: { name: true } }, deal: { select: { id: true, title: true } } },
  });
  const link = "text-indigo-600 hover:text-indigo-500 font-medium";
  return (
    <div>
      <PageHeader
        title={q ? `History - ${q.ref.startsWith("DRAFT-") ? "draft" : q.ref}` : "Quotation history"}
        description={
          q
            ? `${q.customerName || "No customer"} · ${q.owner.name} · ${formatCurrency(q.total)} · first saved ${formatDate(q.createdAt)}`
            : "This quotation has been deleted - its history is kept."
        }
        action={
          <Link href="/quotations/saved" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← Saved quotations
          </Link>
        }
      />
      <div className="p-6 space-y-4 max-w-4xl">
        {q && (
          <p className="text-sm text-slate-600 space-x-4">
            <Link href={`/quotations?quote=${id}`} className={link}>
              Open the quotation
            </Link>
            {q.deal && (
              <Link href={`/deals/${q.deal.id}`} className={link}>
                Deal: {q.deal.title}
              </Link>
            )}
          </p>
        )}
        <HistoryCard entity="quote" id={id} />
      </div>
    </div>
  );
}
