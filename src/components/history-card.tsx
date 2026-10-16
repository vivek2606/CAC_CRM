import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui";
import type { AuditEntity } from "@/lib/audit";

const ACTION: Record<string, string> = {
  created: "Created",
  edited: "Edited",
  stage: "Stage",
  won: "Won",
  lost: "Lost",
  converted: "Converted",
  deleted: "Deleted",
  restored: "Restored",
};
const fmt = (d: Date) =>
  d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

// The Head's view of who created and changed a lead / deal, and when (Lagos
// time). Only rendered for the Head.
export async function HistoryCard({ entity, id }: { entity: AuditEntity; id: string }) {
  const rows = await prisma.auditLog.findMany({
    where: { entity, entityId: id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, action: true, details: true, createdAt: true, user: { select: { name: true, email: true } } },
  });
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-900">History</h2>
      <p className="mb-3 text-xs text-slate-400">Who created and changed this {entity}, and when - visible to you only.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing recorded yet - changes are recorded from now on.</p>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.id} className="border-l-2 border-slate-200 pl-3 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-slate-800">{ACTION[r.action] ?? r.action}</span>
                <span className="text-xs text-slate-500">
                  by {r.user.name} <span className="text-slate-400">({r.user.email})</span> · {fmt(r.createdAt)}
                </span>
              </div>
              {r.details && <p className="text-xs text-slate-600 break-words">{r.details}</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
