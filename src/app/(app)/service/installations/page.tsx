import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireService } from "@/lib/service-access";
import { PageHeader, Card, StatCard, EmptyState, Badge } from "@/components/ui";
import { ExportCsvButton } from "@/components/export-csv-button";
import { INSTALL_LABEL, INSTALL_STATUSES, INSTALL_TONE, OPEN_INSTALL_STATUSES, awaitingHandoverWhere, isInstallStatus, type InstallStatus } from "@/lib/installation";
import { ServiceTabs } from "../service-tabs";

// Installations: supply + installation orders handed over by sales, from
// scheduling to commissioning.

const dmy = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "");

export default async function InstallationsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireService();
  const sp = await searchParams;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const status = sp.status === "all" ? null : isInstallStatus(sp.status) ? sp.status : "open";
  const q = sp.q?.trim() ?? "";
  const where: Prisma.InstallationJobWhereInput = {
    ...(status === "open" ? { status: { in: OPEN_INSTALL_STATUSES } } : status ? { status } : {}),
    ...(q
      ? { OR: [{ ref: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }, { siteAddress: { contains: q, mode: "insensitive" } }, { deal: { invoiceNo: { contains: q, mode: "insensitive" } } }] }
      : {}),
  };
  const [jobs, counts, commissionedMonth, awaiting] = await Promise.all([
    prisma.installationJob.findMany({
      where,
      orderBy: [{ scheduledDate: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      take: 300,
      include: { deal: { select: { id: true, title: true, invoiceNo: true, owner: { select: { name: true } }, installedUnits: { select: { model: true, qty: true } } } } },
    }),
    prisma.installationJob.groupBy({ by: ["status"], _count: true }),
    prisma.installationJob.count({ where: { status: "COMMISSIONED", commissionedAt: { gte: monthStart } } }),
    prisma.deal.findMany({ where: awaitingHandoverWhere(now), orderBy: { closedAt: "desc" }, take: 50, select: { id: true, title: true, closedAt: true, invoiceNo: true, owner: { select: { name: true } } } }),
  ]);
  const count = (s: InstallStatus) => counts.find((c) => c.status === s)?._count ?? 0;
  const late = jobs.filter((j) => (j.status === "SCHEDULED" || j.status === "IN_PROGRESS") && j.scheduledDate && j.scheduledDate < today).length;
  const units = (j: (typeof jobs)[number]) => j.deal.installedUnits.map((u) => `${u.qty} × ${u.model}`).join(", ");
  const filters: { key: string; label: string }[] = [{ key: "open", label: "Open" }, ...INSTALL_STATUSES.map((s) => ({ key: s, label: INSTALL_LABEL[s] })), { key: "all", label: "All" }];

  return (
    <div>
      <PageHeader title="Installations" description="Supply + installation orders handed over by sales - schedule, install, commission and record the serial nos." />
      <div className="p-6 space-y-5">
        <ServiceTabs active="installations" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="To schedule" value={String(count("PENDING"))} sub="handed over, no date yet" accent="amber" />
          <StatCard label="Scheduled / installing" value={String(count("SCHEDULED") + count("IN_PROGRESS"))} sub={late ? `${late} past their date` : "none past their date"} accent={late ? "rose" : "indigo"} />
          <StatCard label="Commissioned this month" value={String(commissionedMonth)} sub="serial nos. recorded" accent="emerald" />
          <StatCard label="Won with installation, not handed over" value={String(awaiting.length)} sub="quoted with installation, last 60 days" accent={awaiting.length ? "rose" : "emerald"} />
        </div>

        {awaiting.length > 0 && (
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Won with installation - not handed over yet</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {awaiting.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <Link href={`/deals/${d.id}`} className="font-medium text-indigo-700 hover:underline">
                    {d.title}
                  </Link>
                  <span className="text-slate-500">
                    {d.owner.name} · won {dmy(d.closedAt)}
                    {d.invoiceNo ? ` · inv ${d.invoiceNo}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
              {filters.map((f) => (
                <Link
                  key={f.key}
                  href={`/service/installations?status=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className={`rounded-md px-3 py-1 text-sm ${(status ?? "all") === f.key ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {f.label}
                </Link>
              ))}
            </div>
            <form action="/service/installations" className="ml-auto flex gap-2">
              <input type="hidden" name="status" value={status ?? "all"} />
              <input name="q" defaultValue={q} placeholder="Ref, customer, site, invoice" className="w-60 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm" />
            </form>
            <ExportCsvButton
              filename="installations.csv"
              headers={["Ref", "Customer", "Site", "Contact", "Phone", "Units", "Sales person", "Invoice", "Preferred", "Scheduled", "Team", "Status", "Commissioned"]}
              rows={jobs.map((j) => [j.ref, j.customerName, j.siteAddress ?? "", j.contactName ?? "", j.phone ?? "", units(j), j.deal.owner.name, j.deal.invoiceNo ?? "", dmy(j.preferredDate), dmy(j.scheduledDate), j.team ?? "", INSTALL_LABEL[j.status as InstallStatus], dmy(j.commissionedAt)])}
            />
          </div>
          {jobs.length === 0 ? (
            <EmptyState title="No installations here" description="Sales hand over won supply + installation orders from the deal page." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3 font-medium">Ref</th>
                    <th className="py-2 pr-3 font-medium">Customer & site</th>
                    <th className="py-2 pr-3 font-medium">Units</th>
                    <th className="py-2 pr-3 font-medium">Sales person</th>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Team</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((j) => {
                    const st = j.status as InstallStatus;
                    const overdue = (st === "SCHEDULED" || st === "IN_PROGRESS") && j.scheduledDate && j.scheduledDate < today;
                    return (
                      <tr key={j.id} className="align-top">
                        <td className="py-2 pr-3">
                          <Link href={`/service/installations/${j.id}`} className="font-medium text-indigo-700 hover:underline">
                            {j.ref}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">
                          <div className="text-slate-800">{j.customerName}</div>
                          <div className="text-xs text-slate-500">{j.siteAddress}</div>
                        </td>
                        <td className="py-2 pr-3 text-xs text-slate-600">{units(j) || "-"}</td>
                        <td className="py-2 pr-3 text-slate-600">{j.deal.owner.name}</td>
                        <td className="py-2 pr-3 text-xs">
                          {j.commissionedAt ? (
                            <span className="text-emerald-700">Done {dmy(j.commissionedAt)}</span>
                          ) : j.scheduledDate ? (
                            <span className={overdue ? "font-semibold text-rose-700" : "text-slate-700"}>
                              {dmy(j.scheduledDate)}
                              {overdue && " · past date"}
                            </span>
                          ) : j.preferredDate ? (
                            <span className="text-slate-500">Preferred {dmy(j.preferredDate)}</span>
                          ) : (
                            <span className="text-slate-400">Not set</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-slate-600">{j.team ?? "-"}</td>
                        <td className="py-2">
                          <Badge bg={INSTALL_TONE[st].bg} text={INSTALL_TONE[st].text}>
                            {INSTALL_LABEL[st]}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
