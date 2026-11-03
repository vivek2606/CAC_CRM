import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { PENDING_STATUSES, STATUS_LABEL, STATUS_TONE, TAT_HOURS, fmtHours, hoursBetween, lagosDateTime, serviceMetrics, type ComplaintStatus } from "@/lib/service";
import { amcStatus } from "@/lib/amc";
import { FileText, LifeBuoy, Plus, ShieldCheck } from "lucide-react";

// The Service Manager's dashboard: complaints (this month's performance and
// what's pending), AMC visits and renewals, and warranties ending.

const DAY = 86400000;
const dmy = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }) : "-");

export async function ServiceDashboard({ name }: { name: string }) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 3600000);
  const in14 = new Date(now.getTime() + 14 * DAY);
  const in30 = new Date(now.getTime() + 30 * DAY);
  const [month, pending, contracts, visits, ending] = await Promise.all([
    prisma.serviceComplaint.findMany({
      where: { registeredAt: { gte: monthStart } },
      select: {
        registeredAt: true, status: true, inWarranty: true, attendedAt: true, resolvedAt: true, visits: true, feedback: true, serviceCharge: true,
        technician: true, nature: true, model: true, serialNo: true, dealId: true,
        parts: { select: { qty: true, unitCost: true, unitPrice: true, chargeable: true } },
      },
    }),
    prisma.serviceComplaint.findMany({
      where: { status: { in: PENDING_STATUSES } },
      orderBy: [{ priority: "desc" }, { registeredAt: "asc" }],
      select: { id: true, ref: true, registeredAt: true, status: true, customerName: true, model: true, nature: true, technician: true, priority: true, inWarranty: true },
    }),
    prisma.amcContract.findMany({ where: { cancelled: false }, select: { id: true, ref: true, customerName: true, startDate: true, endDate: true, cancelled: true, value: true, renewedFromId: true } }),
    prisma.amcVisit.findMany({
      where: { doneAt: null, dueDate: { lte: in14 }, contract: { cancelled: false, endDate: { gte: new Date(now.getTime() - DAY) } } },
      orderBy: { dueDate: "asc" },
      take: 10,
      select: { dueDate: true, contract: { select: { id: true, ref: true, customerName: true } } },
    }),
    prisma.installedUnit.findMany({
      where: { amcId: null, warrantyUntil: { gte: now, lte: in30 } },
      orderBy: { warrantyUntil: "asc" },
      take: 10,
      select: { id: true, customerName: true, model: true, qty: true, warrantyUntil: true },
    }),
  ]);
  const m = serviceMetrics(month, now);
  const over48 = pending.filter((c) => (hoursBetween(c.registeredAt, now) ?? 0) > TAT_HOURS).length;
  const unassigned = pending.filter((c) => !c.technician).length;
  const renewedIds = new Set(contracts.map((c) => c.renewedFromId).filter(Boolean));
  const live = contracts.filter((c) => ["ACTIVE", "RENEWAL_DUE"].includes(amcStatus(c, now)));
  const renewals = contracts.filter((c) => amcStatus(c, now) === "RENEWAL_DUE" && !renewedIds.has(c.id)).sort((a, b) => a.endDate.getTime() - b.endDate.getTime());
  const overdueVisits = visits.filter((v) => v.dueDate < now).length;
  const pct = (p: number | null) => (p == null ? "-" : `${Math.round(p)}%`);
  const monthName = now.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

  return (
    <div>
      <PageHeader
        title="Service Dashboard"
        description={`${name} · complaints, AMC and warranty · ${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" })}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/service/new" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500">
              <Plus className="h-4 w-4" /> Register complaint
            </Link>
            <Link href="/service/amc/new" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <ShieldCheck className="h-4 w-4" /> New AMC
            </Link>
            <Link href="/quotations" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <FileText className="h-4 w-4" /> Service quotation
            </Link>
          </div>
        }
      />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Pending complaints"
            value={String(pending.length)}
            sub={`${over48} over ${TAT_HOURS} h · ${unassigned} not assigned`}
            icon={<LifeBuoy className="h-4 w-4 text-rose-500" />}
            accent={over48 ? "rose" : "emerald"}
          />
          <StatCard label={`Registered in ${monthName}`} value={String(m.total)} sub={`${m.resolved} resolved · ${m.inWarranty} in warranty / AMC`} accent="indigo" />
          <StatCard label="Avg response / resolution" value={fmtHours(m.avgResponseHours)} sub={`${fmtHours(m.avgResolutionHours)} to resolve · ${pct(m.onTimePct)} within ${TAT_HOURS} h`} accent="sky" />
          <StatCard
            label="First-time fix · rating"
            value={pct(m.firstTimeFixPct)}
            sub={`${m.avgFeedback != null ? `${m.avgFeedback.toFixed(1)} / 5 rating` : "no ratings yet"} · ${m.repeats} repeat${m.repeats === 1 ? "" : "s"}`}
            accent="emerald"
          />
          <StatCard label="Active AMCs" value={String(live.length)} sub={`${formatCurrency(live.reduce((s, c) => s + c.value, 0))} a year`} accent="emerald" />
          <StatCard label="AMC visits" value={`${overdueVisits} overdue`} sub={`${visits.length - overdueVisits} due in 14 days`} accent={overdueVisits ? "rose" : "sky"} />
          <StatCard label="AMCs to renew" value={String(renewals.length)} sub={`${formatCurrency(renewals.reduce((s, c) => s + c.value, 0))} in 30 days`} accent="amber" />
          <StatCard
            label={`Billed out of warranty (${monthName})`}
            value={formatCurrency(m.billed)}
            sub={`${formatCurrency(m.warrantyPartsCost)} spares free in warranty`}
            accent="slate"
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Pending complaints - oldest first</h2>
              <Link href="/service" className="text-xs text-indigo-600 hover:text-indigo-500">
                All complaints →
              </Link>
            </div>
            {pending.length === 0 ? (
              <EmptyState title="Nothing pending" description="All complaints are resolved." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {pending.slice(0, 10).map((c) => {
                  const age = hoursBetween(c.registeredAt, now);
                  return (
                    <li key={c.id} className="flex items-start gap-3 py-2">
                      <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${(age ?? 0) > TAT_HOURS ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>
                        {fmtHours(age)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/service/${c.id}`} className="text-sm font-medium text-slate-900 hover:text-indigo-600">
                          {c.ref} · {c.customerName}
                        </Link>
                        {c.priority === "URGENT" && <span className="ml-1.5 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">URGENT</span>}
                        <p className="text-xs text-slate-500">
                          {c.nature}
                          {c.model ? ` · ${c.model}` : ""} · {c.inWarranty ? "in warranty" : "chargeable"} · {c.technician ?? <span className="text-rose-600">not assigned</span>} · {lagosDateTime(c.registeredAt)}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[c.status as ComplaintStatus] ?? ""}`}>{STATUS_LABEL[c.status as ComplaintStatus] ?? c.status}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <div className="space-y-5">
            <Card className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">AMC visits due</h2>
                <Link href="/service/amc" className="text-xs text-indigo-600 hover:text-indigo-500">
                  AMC contracts →
                </Link>
              </div>
              {visits.length === 0 ? (
                <p className="text-sm text-slate-500">No visits due in the next 14 days.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {visits.map((v, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <Link href={`/service/amc/${v.contract.id}`} className="text-slate-800 hover:text-indigo-600">
                        {v.contract.ref} · {v.contract.customerName}
                      </Link>
                      <span className={v.dueDate < now ? "font-semibold text-rose-600" : "text-slate-500"}>{dmy(v.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {renewals.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-2">
                  <p className="mb-1 text-xs font-semibold text-amber-700">To renew</p>
                  {renewals.slice(0, 5).map((c) => (
                    <Link key={c.id} href={`/service/amc/${c.id}`} className="flex justify-between text-sm text-slate-800 hover:text-indigo-600">
                      <span>
                        {c.ref} · {c.customerName}
                      </span>
                      <span className="text-slate-500">ends {dmy(c.endDate)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
            <Card className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Warranties ending in 30 days - offer an AMC</h2>
                <Link href="/service/units?w=ending" className="text-xs text-indigo-600 hover:text-indigo-500">
                  All →
                </Link>
              </div>
              {ending.length === 0 ? (
                <p className="text-sm text-slate-500">None in the next 30 days.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {ending.map((u) => (
                    <li key={u.id} className="flex justify-between gap-2">
                      <span className="text-slate-800">
                        {u.customerName} · {u.qty} × {u.model}
                      </span>
                      <span className="whitespace-nowrap">
                        <span className="text-slate-500">{dmy(u.warrantyUntil)}</span>{" "}
                        <Link href={`/service/amc/new?unit=${u.id}`} className="font-medium text-amber-700 hover:text-amber-600">
                          Offer AMC
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
