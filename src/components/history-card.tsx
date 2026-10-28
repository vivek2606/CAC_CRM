import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui";
import type { AuditEntity } from "@/lib/audit";

export const HISTORY_ACTION: Record<string, string> = {
  created: "Created",
  edited: "Changed",
  stage: "Stage",
  won: "Won",
  lost: "Lost",
  converted: "Converted",
  deleted: "Deleted",
  restored: "Restored",
};
export const historyTime = (d: Date) =>
  d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
const NOUN: Record<AuditEntity, string> = { lead: "lead", deal: "deal", quote: "quotation", product: "product and its prices", tentative: "tentative price", exchangeRate: "exchange rate" };

// One history entry: "(Upload ...)" context, then each change on its own line.
export function HistoryDetails({ details }: { details: string | null }) {
  if (!details) return null;
  const m = /^\(([^)]*)\)\s*/.exec(details);
  const reason = m?.[1];
  const parts = (m ? details.slice(m[0].length) : details).split("; ").filter(Boolean);
  return (
    <div className="text-xs text-slate-600">
      {reason && <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{reason}</span>}
      {parts.length <= 1 ? (
        <span className="break-words">{parts[0]}</span>
      ) : (
        <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
          {parts.map((p, i) => (
            <li key={i} className="break-words">
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The Head's view of who created and changed a record, and when (Lagos
// time) - every change, field by field. Only rendered for the Head.
export async function HistoryCard({ entity, id, title = "History" }: { entity: AuditEntity; id: string; title?: string }) {
  const rows = await prisma.auditLog.findMany({
    where: { entity, entityId: id },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, action: true, details: true, createdAt: true, user: { select: { name: true, email: true } } },
  });
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mb-3 text-xs text-slate-400">Who created and changed this {NOUN[entity]}, and when - every change, field by field. Visible to you only.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing recorded yet - changes are recorded from now on.</p>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.id} className="border-l-2 border-slate-200 pl-3 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-slate-800">{HISTORY_ACTION[r.action] ?? r.action}</span>
                <span className="text-xs text-slate-500">
                  by {r.user.name} <span className="text-slate-400">({r.user.email})</span> · {historyTime(r.createdAt)}
                </span>
              </div>
              <HistoryDetails details={r.details} />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
