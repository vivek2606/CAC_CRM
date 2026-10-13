import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { purgeRecycleBin, KEEP_DAYS } from "@/lib/recycle-bin";
import { BinRowActions } from "./bin-row-actions";

const KIND_LABEL: Record<string, string> = { deal: "Deal", lead: "Lead", leadBatch: "Leads (bulk clear)", billing: "Project billing" };

// Deleted deals and leads, kept for KEEP_DAYS days - restore one with its
// products, Sales Register lines, activities, notes and quotations.
export default async function RecycleBinPage() {
  await requireBackOffice();
  await purgeRecycleBin();
  const rows = await prisma.deletedRecord.findMany({
    orderBy: { deletedAt: "desc" },
    take: 500,
    select: { id: true, kind: true, label: true, ownerName: true, value: true, deletedAt: true, deletedBy: { select: { name: true } } },
  });
  const th = "py-2 pr-3 font-medium";
  return (
    <div>
      <PageHeader title="Recycle bin" description={`Deleted deals, leads and project billing, kept for ${KEEP_DAYS} days - restore one with everything that went with it`} />
      <div className="p-6">
        <Card className="p-5">
          {rows.length === 0 ? (
            <EmptyState title="The recycle bin is empty" description="Deleted deals and leads appear here." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className={th}>Deleted</th>
                  <th className={th}>Type</th>
                  <th className={th}>Record</th>
                  <th className={th}>Sales person</th>
                  <th className={`${th} text-right`}>Value</th>
                  <th className={th}>Deleted by</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-slate-600">{formatDateTime(r.deletedAt)}</td>
                    <td className="py-1.5 pr-3 text-slate-600">{KIND_LABEL[r.kind] ?? r.kind}</td>
                    <td className="py-1.5 pr-3 font-medium text-slate-800">{r.label}</td>
                    <td className="py-1.5 pr-3 text-slate-600">{r.ownerName ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-700">{formatCurrency(r.value)}</td>
                    <td className="py-1.5 pr-3 text-slate-600">{r.deletedBy.name}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <BinRowActions id={r.id} label={r.label} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
