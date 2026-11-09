import Link from "next/link";
import { formatDate } from "@/lib/format";
import { RESERVATION_STATUS_LABEL, RESERVATION_STATUS_TONE } from "@/lib/reservations";
import { ReservationActions } from "./reservation-ui";
import { customerOf, type ReservationRow } from "./data";

// Reservations with their status and the actions the viewer may take.
export function ReservationTable({ rows, viewer, showDeal = true }: { rows: ReservationRow[]; viewer: { id: string; role: string }; showDeal?: boolean }) {
  const isHead = viewer.role === "HEAD";
  const backOffice = isHead || viewer.role === "COORDINATOR";
  const th = "py-1.5 pr-3 text-xs font-medium uppercase tracking-wide text-slate-400";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th className={th}>Item</th>
            <th className={`${th} text-right`}>Qty</th>
            {showDeal && <th className={th}>Deal</th>}
            <th className={th}>Status</th>
            <th className={th}>Why / note</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="py-2 pr-3">
                <span className="font-medium text-slate-800">{r.product.model}</span>
                <span className="ml-1.5 text-xs text-slate-400">{r.product.code}</span>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums font-medium">{r.qty}</td>
              {showDeal && (
                <td className="py-2 pr-3">
                  <Link href={`/deals/${r.deal.id}`} className="text-indigo-700 hover:underline">
                    {customerOf(r) || r.deal.title}
                  </Link>
                  <div className="text-xs text-slate-500">{r.deal.owner.name}</div>
                </td>
              )}
              <td className="py-2 pr-3 whitespace-nowrap">
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${RESERVATION_STATUS_TONE[r.status]}`}>{RESERVATION_STATUS_LABEL[r.status]}</span>
                <div className="mt-0.5 text-xs text-slate-500">
                  {r.status === "APPROVED" && r.expiresAt ? `until ${formatDate(r.expiresAt)}` : r.status === "REQUESTED" ? `asked ${formatDate(r.requestedAt)}` : r.endedAt ? formatDate(r.endedAt) : ""}
                </div>
              </td>
              <td className="py-2 pr-3 text-xs text-slate-600">
                {r.reason}
                {r.decisionNote && (
                  <div className="text-slate-500">
                    {r.decidedBy?.name ?? "Head"}: {r.decisionNote}
                  </div>
                )}
              </td>
              <td className="py-2">
                <ReservationActions id={r.id} status={r.status} isHead={isHead} canRelease={backOffice || r.deal.ownerId === viewer.id || r.requestedById === viewer.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
