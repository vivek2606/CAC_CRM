import Link from "next/link";
import { requireUser, isBackOffice, visibleOwnerIds } from "@/lib/rbac";
import { blockServiceManager } from "@/lib/service-access";
import { PageHeader, Card } from "@/components/ui";
import { RESERVATION_DAYS } from "@/lib/reservations";
import { listReservations } from "./data";
import { ReservationTable } from "./reservation-table";

// Stock reservations: requests awaiting the Head, units held, and those
// ended in the last 30 days. The Head and the Coordinator download the
// list for the warehouse.
export default async function ReservationsPage() {
  await blockServiceManager();
  const user = await requireUser();
  const backOffice = isBackOffice(user);
  const rows = await listReservations({ ownerIds: backOffice ? undefined : await visibleOwnerIds(user), recentDays: 30 });
  const requested = rows.filter((r) => r.status === "REQUESTED");
  const held = rows.filter((r) => r.status === "APPROVED");
  const ended = rows.filter((r) => r.status !== "REQUESTED" && r.status !== "APPROVED");
  const units = (xs: typeof rows) => xs.reduce((s, r) => s + r.qty, 0);
  return (
    <div>
      <PageHeader
        title="Stock reservations"
        description={`Units held for a deal for ${RESERVATION_DAYS} days once the Head approves - asked for from the deal page`}
        action={
          backOffice ? (
            <span className="flex gap-2">
              <a href="/stock/reservations/xlsx" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
                Download for the warehouse
              </a>
            </span>
          ) : undefined
        }
      />
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            Awaiting approval ({requested.length} request{requested.length === 1 ? "" : "s"}, {units(requested)} units)
          </h2>
          {requested.length ? <ReservationTable rows={requested} viewer={user} /> : <p className="text-sm text-slate-500">Nothing waiting.</p>}
        </Card>
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            Reserved ({units(held)} units)
          </h2>
          {held.length ? <ReservationTable rows={held} viewer={user} /> : <p className="text-sm text-slate-500">No stock is reserved.</p>}
          <p className="mt-2 text-xs text-slate-500">
            Reserved units are taken off &quot;available&quot; everywhere else. A reservation ends when the item is invoiced on the deal, the deal is lost, it&apos;s released, or its time runs out.
          </p>
        </Card>
        {ended.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Ended or rejected, last 30 days</h2>
            <ReservationTable rows={ended} viewer={user} />
          </Card>
        )}
        <p className="text-xs text-slate-400">
          <Link href="/stock" className="text-indigo-600">
            ← Stock & Pending Orders
          </Link>
        </p>
      </div>
    </div>
  );
}
