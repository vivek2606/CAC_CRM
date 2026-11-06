import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireService } from "@/lib/service-access";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { ExportCsvButton } from "@/components/export-csv-button";
import { formatCurrency } from "@/lib/format";
import {
  COMPLAINT_STATUSES,
  PENDING_STATUSES,
  STATUS_LABEL,
  STATUS_TONE,
  TAT_HOURS,
  REPEAT_DAYS,
  fmtHours,
  groupMetrics,
  hoursBetween,
  lagosDateTime,
  serviceMetrics,
  type ComplaintStatus,
} from "@/lib/service";
import { Plus } from "lucide-react";
import { ServiceTabs } from "./service-tabs";
import { withLineUnits } from "@/lib/installed-base";
import { getSla, slaCompliance, slaSummary, STAGE_LABEL as SLA_STAGE, STATE_LABEL as SLA_LABEL, STATE_TONE as SLA_TONE } from "@/lib/service-sla";
import { SlaSettingsForm } from "./sla-settings";

// Service & Complaints (Head, Sales Coordinator, Service Manager): the
// complaints registered in a period and how service performed on them.

const day = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; warranty?: string; tech?: string; q?: string; from?: string; to?: string; sla?: string }>;
}) {
  const user = await requireService();
  const sla = await getSla();
  const sp = await searchParams;
  const now = new Date();
  const from = day(sp.from) ?? new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const to = day(sp.to) ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Lagos midnight bounds.
  const start = new Date(from.getTime() - 3600000);
  const end = new Date(to.getTime() + 86400000 - 3600000);
  const status = sp.status === "all" || COMPLAINT_STATUSES.includes(sp.status as ComplaintStatus) ? sp.status! : "pending";
  const q = sp.q?.trim() ?? "";

  const periodWhere: Prisma.ServiceComplaintWhereInput = {
    registeredAt: { gte: start, lt: end },
    ...(sp.warranty === "in" ? { inWarranty: true } : sp.warranty === "out" ? { inWarranty: false } : {}),
    ...(sp.tech ? { technician: sp.tech } : {}),
  };
  const [inPeriod, technicians, pendingAll] = await Promise.all([
    prisma.serviceComplaint.findMany({
      where: periodWhere,
      select: {
        registeredAt: true,
        status: true,
        priority: true,
        assignedAt: true,
        inWarranty: true,
        attendedAt: true,
        resolvedAt: true,
        visits: true,
        feedback: true,
        serviceCharge: true,
        technician: true,
        nature: true,
        model: true,
        serialNo: true,
        dealId: true,
        parts: { select: { qty: true, unitCost: true, unitPrice: true, chargeable: true } },
      },
    }),
    prisma.serviceComplaint.findMany({ where: { technician: { not: null } }, distinct: ["technician"], select: { technician: true } }),
    // Every complaint still with us, whatever the period.
    prisma.serviceComplaint.count({ where: { status: { in: PENDING_STATUSES } } }),
  ]);
  const m = serviceMetrics(await withLineUnits(inPeriod), now);
  const listWhere: Prisma.ServiceComplaintWhereInput = {
    ...(status === "pending" ? { status: { in: PENDING_STATUSES } } : { ...periodWhere, ...(status !== "all" ? { status } : {}) }),
    ...(status === "pending" && sp.warranty ? { inWarranty: sp.warranty === "in" } : {}),
    ...(status === "pending" && sp.tech ? { technician: sp.tech } : {}),
    ...(q
      ? {
          OR: [
            { ref: { contains: q, mode: "insensitive" } },
            { customerName: { contains: q, mode: "insensitive" } },
            { invoiceNo: { contains: q, mode: "insensitive" } },
            { serialNo: { contains: q, mode: "insensitive" } },
            { model: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };
  const list = await prisma.serviceComplaint.findMany({
    where: listWhere,
    orderBy: { registeredAt: status === "pending" ? "asc" : "desc" },
    take: 300,
    select: {
      id: true,
      ref: true,
      registeredAt: true,
      status: true,
      customerName: true,
      model: true,
      serialNo: true,
      invoiceNo: true,
      inWarranty: true,
      nature: true,
      priority: true,
      technician: true,
      assignedAt: true,
      attendedAt: true,
      resolvedAt: true,
      visits: true,
    },
  });
  // Service levels: each complaint's, and (sla=breached / at_risk) only those.
  const slaOf = new Map(list.map((c) => [c.id, slaSummary(c, sla, now)]));
  const listShown = sp.sla === "breached" || sp.sla === "at_risk" ? list.filter((c) => slaOf.get(c.id)!.state === sp.sla) : list;
  const compliance = slaCompliance(inPeriod, sla, now);
  const byTech = groupMetrics(inPeriod, (c) => c.technician ?? "Not assigned");
  const byNature = groupMetrics(inPeriod, (c) => c.nature);
  const byModel = groupMetrics(inPeriod, (c) => c.model ?? "Not recorded").slice(0, 10);
  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
  const pctText = (p: number | null) => (p == null ? "-" : `${Math.round(p)}%`);

  const breakdown = (title: string, rows: typeof byTech) => (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing in this period.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
              <th className="py-1.5 pr-2 font-medium"></th>
              <th className="py-1.5 px-2 text-right font-medium">Complaints</th>
              <th className="py-1.5 px-2 text-right font-medium">Pending</th>
              <th className="py-1.5 px-2 text-right font-medium">Avg resolution</th>
              <th className="py-1.5 pl-2 text-right font-medium">First-time fix</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-1.5 pr-2 text-slate-800">{r.key}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{r.total}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{r.pending}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{fmtHours(r.avgResolutionHours)}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{pctText(r.firstTimeFixPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );

  return (
    <div>
      <PageHeader
        title="Service & Complaints"
        description="Complaints on units sold - registration to closing, warranty, spares and service performance (Lagos time)"
        action={
          <Link href="/service/new" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            <Plus className="h-4 w-4" /> Register complaint
          </Link>
        }
      />
      <div className="p-6 space-y-5">
        <ServiceTabs active="complaints" />
        <form className="flex flex-wrap items-end gap-3" action="/service">
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">Registered from</span>
            <input type="date" name="from" defaultValue={iso(from)} className={field} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">To</span>
            <input type="date" name="to" defaultValue={iso(to)} className={field} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">Warranty</span>
            <select name="warranty" defaultValue={sp.warranty ?? ""} className={field}>
              <option value="">In & out of warranty</option>
              <option value="in">In warranty</option>
              <option value="out">Out of warranty</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">Technician</span>
            <select name="tech" defaultValue={sp.tech ?? ""} className={field}>
              <option value="">Everyone</option>
              {technicians.map((t) => (
                <option key={t.technician} value={t.technician!}>
                  {t.technician}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Show
          </button>
          <input type="hidden" name="status" value={status} />
        </form>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Complaints registered" value={String(m.total)} sub={`${m.inWarranty} in warranty · ${m.outWarranty} out of warranty`} accent="indigo" />
          <StatCard
            label="Pending now"
            value={String(pendingAll)}
            sub={m.oldestPendingHours != null ? `${m.pendingOver48h} over ${TAT_HOURS} h · oldest ${fmtHours(m.oldestPendingHours)}` : "None pending in this period"}
            accent={pendingAll ? "rose" : "emerald"}
          />
          <StatCard label="Avg response time" value={fmtHours(m.avgResponseHours)} sub="Registered → first visit" accent="sky" />
          <StatCard label="Avg resolution time" value={fmtHours(m.avgResolutionHours)} sub={`${pctText(m.onTimePct)} resolved within ${TAT_HOURS} h`} accent="violet" />
          <StatCard
            label="Service levels met"
            value={pctText(compliance.resolve.pct)}
            sub={`resolved in time · assigned ${pctText(compliance.assign.pct)} · first visit ${pctText(compliance.attend.pct)}`}
            accent={compliance.resolve.pct != null && compliance.resolve.pct < 80 ? "rose" : "emerald"}
          />
          <StatCard label="First-time fix" value={pctText(m.firstTimeFixPct)} sub={`of ${m.resolved} resolved, fixed on the first visit`} accent="emerald" />
          <StatCard label="Repeat complaints" value={String(m.repeats)} sub={`Same unit again within ${REPEAT_DAYS} days`} accent="amber" />
          <StatCard label="Customer rating" value={m.avgFeedback != null ? `${m.avgFeedback.toFixed(1)} / 5` : "-"} sub={`${m.rated} rated`} accent="amber" />
          <StatCard
            label="Spares & billing"
            value={formatCurrency(m.billed)}
            sub={`billed out of warranty · ${formatCurrency(m.warrantyPartsCost)} spares free in warranty (our cost)`}
            accent="slate"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {breakdown("By technician", byTech)}
          {breakdown("By nature of complaint", byNature)}
          {breakdown("By model (top 10)", byModel)}
        </div>

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
              {[["pending", "Pending"], ["all", "All in period"], ["RESOLVED", "Resolved"], ["CLOSED", "Closed"], ["CANCELLED", "Cancelled"]].map(([k, l]) => (
                <Link
                  key={k}
                  href={`/service?${new URLSearchParams({ ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}), ...(sp.warranty ? { warranty: sp.warranty } : {}), ...(sp.tech ? { tech: sp.tech } : {}), status: k })}`}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${status === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {l}
                </Link>
              ))}
            </div>
            {status === "pending" && (
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                {[["", "Any service level"], ["breached", "Past service level"], ["at_risk", "At risk"]].map(([k, l]) => (
                  <Link
                    key={k}
                    href={`/service?${new URLSearchParams({ status: "pending", ...(k ? { sla: k } : {}) })}`}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${(sp.sla ?? "") === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    {l}
                  </Link>
                ))}
              </div>
            )}
            <form action="/service" className="ml-auto flex gap-2">
              {Object.entries({ from: sp.from, to: sp.to, warranty: sp.warranty, tech: sp.tech, status }).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
              <input name="q" defaultValue={q} placeholder="Ref, customer, invoice, serial, phone" className={`${field} w-64`} />
            </form>
            <ExportCsvButton
              filename={`service-complaints-${iso(from)}-${iso(to)}.csv`}
              headers={["Ref", "Registered", "Status", "Customer", "Model", "Serial no.", "Invoice", "Warranty", "Nature", "Technician", "Response (h)", "Resolution (h)", "Visits", "Service level"]}
              rows={listShown.map((c) => [
                c.ref,
                lagosDateTime(c.registeredAt),
                STATUS_LABEL[c.status as ComplaintStatus] ?? c.status,
                c.customerName,
                c.model ?? "",
                c.serialNo ?? "",
                c.invoiceNo ?? "",
                c.inWarranty ? "In" : "Out",
                c.nature,
                c.technician ?? "",
                hoursBetween(c.registeredAt, c.attendedAt)?.toFixed(1) ?? "",
                hoursBetween(c.registeredAt, c.resolvedAt)?.toFixed(1) ?? "",
                c.visits,
                SLA_LABEL[slaOf.get(c.id)!.state],
              ])}
            />
          </div>
          {listShown.length === 0 ? (
            <EmptyState title={status === "pending" ? "No pending complaints" : "No complaints"} description="Register one with the button above." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3 font-medium">Ref</th>
                    <th className="py-2 pr-3 font-medium">Registered</th>
                    <th className="py-2 pr-3 font-medium">Customer</th>
                    <th className="py-2 pr-3 font-medium">Unit</th>
                    <th className="py-2 pr-3 font-medium">Nature</th>
                    <th className="py-2 pr-3 font-medium">Warranty</th>
                    <th className="py-2 pr-3 font-medium">Technician</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Service level</th>
                    <th className="py-2 pr-3 text-right font-medium">Age / took</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {listShown.map((c) => {
                    const lv = slaOf.get(c.id)!;
                    const took = hoursBetween(c.registeredAt, c.resolvedAt ?? now);
                    const late = !c.resolvedAt && took != null && took > TAT_HOURS;
                    return (
                      <tr key={c.id} className="align-top hover:bg-slate-50">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <Link href={`/service/${c.id}`} className="font-medium text-indigo-600 hover:text-indigo-500">
                            {c.ref}
                          </Link>
                          {c.priority === "URGENT" && <span className="ml-1.5 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">URGENT</span>}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap text-xs text-slate-600">{lagosDateTime(c.registeredAt)}</td>
                        <td className="py-2 pr-3 text-slate-800">{c.customerName}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600">
                          {c.model ?? "-"}
                          {c.serialNo ? <div className="text-slate-400">S/N {c.serialNo}</div> : null}
                          {c.invoiceNo ? <div className="text-slate-400">Inv {c.invoiceNo}</div> : null}
                        </td>
                        <td className="py-2 pr-3 text-xs text-slate-700">{c.nature}</td>
                        <td className="py-2 pr-3 text-xs">
                          <span className={`rounded-full px-2 py-0.5 font-medium ${c.inWarranty ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                            {c.inWarranty ? "In" : "Out"}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-slate-700">{c.technician ?? <span className="text-rose-600">Not assigned</span>}</td>
                        <td className="py-2 pr-3 text-xs">
                          <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_TONE[c.status as ComplaintStatus] ?? ""}`}>{STATUS_LABEL[c.status as ComplaintStatus] ?? c.status}</span>
                        </td>
                        <td className="py-2 pr-3 text-xs whitespace-nowrap">
                          <span className={`rounded-full px-2 py-0.5 font-medium ${SLA_TONE[lv.state]}`}>{SLA_LABEL[lv.state]}</span>
                          {lv.stage && lv.state !== "met" && <div className="mt-0.5 text-slate-400">{SLA_STAGE[lv.stage]}</div>}
                        </td>
                        <td className={`py-2 pr-3 text-right text-xs tabular-nums ${late ? "font-semibold text-rose-600" : "text-slate-600"}`}>{fmtHours(took)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Service level targets - assign {sla.assignHours.NORMAL} h, first visit {sla.attendHours.NORMAL} h, resolve {sla.resolveHours.NORMAL} h (urgent: {sla.assignHours.URGENT} /{" "}
            {sla.attendHours.URGENT} / {sla.resolveHours.URGENT} h), close within {sla.closeDays} days
          </summary>
          <div className="mt-3">
            <p className="mb-3 text-xs text-slate-500">
              At risk when three-quarters of the time is gone - the Service Manager gets a push; past the target, the Head and the Sales Coordinator are pushed too.
            </p>
            {user.role === "HEAD" ? <SlaSettingsForm sla={sla} /> : <p className="text-xs text-slate-500">Set by the Head of Sales.</p>}
          </div>
        </details>
      </div>
    </div>
  );
}
