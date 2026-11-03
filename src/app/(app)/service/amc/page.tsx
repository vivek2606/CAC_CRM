import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireService } from "@/lib/service-access";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { AMC_STATUS_LABEL, AMC_STATUS_TONE, amcStatus, type AmcStatus } from "@/lib/amc";
import { ServiceTabs } from "../service-tabs";
import { Plus } from "lucide-react";

// AMC / PPM contracts: what's active, renewals coming up and the visits due.

const DAY = 86400000;
const dmy = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "-");

export default async function AmcPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireService();
  const sp = await searchParams;
  const now = new Date();
  const contracts = await prisma.amcContract.findMany({
    orderBy: { endDate: "asc" },
    include: { units: { select: { qty: true } }, visits: { select: { dueDate: true, doneAt: true } } },
  });
  const rows = contracts.map((c) => {
    const status = amcStatus(c, now);
    const done = c.visits.filter((v) => v.doneAt).length;
    const next = c.visits.filter((v) => !v.doneAt).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0]?.dueDate ?? null;
    const overdue = c.visits.filter((v) => !v.doneAt && v.dueDate < now).length;
    return { ...c, status, done, next, overdue, units: c.units.reduce((s, u) => s + u.qty, 0) };
  });
  const live = rows.filter((r) => r.status === "ACTIVE" || r.status === "RENEWAL_DUE");
  const filter = sp.status ?? "live";
  const shown = filter === "all" ? rows : filter === "live" ? live : rows.filter((r) => r.status === filter);
  const week = new Date(now.getTime() + 7 * DAY);
  const dueThisWeek = live.reduce((s, r) => s + contracts.find((c) => c.id === r.id)!.visits.filter((v) => !v.doneAt && v.dueDate >= now && v.dueDate <= week).length, 0);
  const overdue = live.reduce((s, r) => s + r.overdue, 0);
  const renewals = rows.filter((r) => r.status === "RENEWAL_DUE");
  const expiredUnrenewed = rows.filter((r) => r.status === "EXPIRED" && !rows.some((x) => x.renewedFromId === r.id));

  return (
    <div>
      <PageHeader
        title="AMC Contracts"
        description="Annual maintenance / PPM contracts - units covered, visits and renewals"
        action={
          <Link href="/service/amc/new" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            <Plus className="h-4 w-4" /> New AMC
          </Link>
        }
      />
      <div className="p-6 space-y-5">
        <ServiceTabs active="amc" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Active contracts" value={String(live.length)} sub={`${formatCurrency(live.reduce((s, r) => s + r.value, 0))} a year · ${live.reduce((s, r) => s + r.units, 0)} units`} accent="emerald" />
          <StatCard label="Renewals due (30 days)" value={String(renewals.length)} sub={`${formatCurrency(renewals.reduce((s, r) => s + r.value, 0))} to renew`} accent="amber" />
          <StatCard label="Visits" value={`${overdue} overdue`} sub={`${dueThisWeek} due in the next 7 days`} accent={overdue ? "rose" : "sky"} />
          <StatCard label="Expired, not renewed" value={String(expiredUnrenewed.length)} sub="Win them back" accent="slate" />
        </div>
        <Card className="p-4">
          <div className="mb-3 inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
            {[["live", "Active"], ["RENEWAL_DUE", "Renewal due"], ["EXPIRED", "Expired"], ["CANCELLED", "Cancelled"], ["all", "All"]].map(([k, l]) => (
              <Link
                key={k}
                href={`/service/amc?status=${k}`}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {l}
              </Link>
            ))}
          </div>
          {shown.length === 0 ? (
            <EmptyState title="No contracts here" description="Offer AMCs from Installed units - warranties ending soon." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3 font-medium">Ref</th>
                    <th className="py-2 pr-3 font-medium">Customer</th>
                    <th className="py-2 pr-3 font-medium">Period</th>
                    <th className="py-2 pr-3 text-right font-medium">Units</th>
                    <th className="py-2 pr-3 text-right font-medium">Value</th>
                    <th className="py-2 pr-3 font-medium">Visits</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <Link href={`/service/amc/${r.id}`} className="font-medium text-indigo-600 hover:text-indigo-500">
                          {r.ref}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-slate-800">
                        {r.customerName}
                        <div className="text-xs text-slate-400">{r.comprehensive ? "Comprehensive" : "Labour / servicing only"}</div>
                      </td>
                      <td className="py-2 pr-3 text-xs whitespace-nowrap text-slate-600">
                        {dmy(r.startDate)} - {dmy(r.endDate)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.units}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(r.value)}</td>
                      <td className="py-2 pr-3 text-xs whitespace-nowrap">
                        {r.done}/{r.visits.length} done
                        {r.overdue > 0 ? <span className="ml-1 font-semibold text-rose-600">{r.overdue} overdue</span> : r.next ? <span className="ml-1 text-slate-500">next {dmy(r.next)}</span> : null}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${AMC_STATUS_TONE[r.status as AmcStatus]}`}>{AMC_STATUS_LABEL[r.status as AmcStatus]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
