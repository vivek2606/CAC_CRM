import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireService } from "@/lib/service-access";
import { PageHeader, Card } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { AMC_STATUS_LABEL, AMC_STATUS_TONE, amcStatus } from "@/lib/amc";
import { ServiceTabs } from "../../service-tabs";
import { AmcActions, AmcUnits, VisitRow } from "./amc-actions";

const dmy = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "-");

export default async function AmcContractPage({ params }: { params: Promise<{ id: string }> }) {
  await requireService();
  const { id } = await params;
  const c = await prisma.amcContract.findUnique({
    where: { id },
    include: { units: { orderBy: { invoiceDate: "desc" } }, visits: { orderBy: { dueDate: "asc" } }, createdBy: { select: { name: true } } },
  });
  if (!c) notFound();
  const status = amcStatus(c);
  const [renewal, renewedFrom, others, complaints] = await Promise.all([
    prisma.amcContract.findFirst({ where: { renewedFromId: c.id }, select: { id: true, ref: true } }),
    c.renewedFromId ? prisma.amcContract.findUnique({ where: { id: c.renewedFromId }, select: { id: true, ref: true } }) : null,
    // The customer's other units, to add.
    prisma.installedUnit.findMany({
      where: { ...(c.accountId ? { accountId: c.accountId } : { customerName: c.customerName }), NOT: { amcId: c.id } },
      orderBy: { invoiceDate: "desc" },
      take: 200,
      select: { id: true, qty: true, model: true, invoiceNo: true, amcId: true },
    }),
    // Complaints on its units during the contract.
    prisma.serviceComplaint.findMany({
      where: {
        registeredAt: { gte: c.startDate, lte: new Date(c.endDate.getTime() + 86400000) },
        OR: [{ dealId: { in: c.units.map((u) => u.dealId).filter((x): x is string => !!x) } }, { serialNo: { in: c.units.flatMap((u) => u.serialNos) } }],
      },
      orderBy: { registeredAt: "desc" },
      select: { id: true, ref: true, nature: true, status: true, registeredAt: true },
    }),
  ]);
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-800">{value}</span>
    </div>
  );
  const unitCount = c.units.reduce((s, u) => s + u.qty, 0);

  return (
    <div>
      <PageHeader title={`AMC ${c.ref}`} description={`${c.customerName} · ${dmy(c.startDate)} - ${dmy(c.endDate)}`} />
      <div className="p-6 space-y-5">
        <ServiceTabs active="amc" />
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${AMC_STATUS_TONE[status]}`}>{AMC_STATUS_LABEL[status]}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{c.comprehensive ? "Comprehensive - spares included" : "Labour / servicing only - spares charged"}</span>
          {renewal && (
            <Link href={`/service/amc/${renewal.id}`} className="text-sm font-medium text-indigo-600">
              Renewed as {renewal.ref} →
            </Link>
          )}
          {renewedFrom && (
            <Link href={`/service/amc/${renewedFrom.id}`} className="text-sm text-slate-500 hover:text-indigo-600">
              Renewal of {renewedFrom.ref}
            </Link>
          )}
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="p-4">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">Contract</h3>
            {row("Customer", c.customerName)}
            {c.contactName && row("Contact", c.contactName)}
            {c.phone && row("Phone", c.phone)}
            {c.siteAddress && row("Site", c.siteAddress)}
            {row("Period", `${dmy(c.startDate)} - ${dmy(c.endDate)}`)}
            {row("Value (excl. VAT)", formatCurrency(c.value))}
            {row("Visits a year", String(c.visitsPerYear))}
            {row("Billed by", c.billingCompany ?? "-")}
            {row("Invoice no.", c.invoiceNo ?? "Not billed yet")}
            {c.notes && row("Scope / notes", c.notes)}
            {row("Created by", c.createdBy.name)}
          </Card>
          <Card className="p-4 lg:col-span-2">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Service visits</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
                  <th className="py-1.5 pr-2 font-medium">Due</th>
                  <th className="py-1.5 pr-2 font-medium">Done</th>
                  <th className="py-1.5 pr-2 font-medium">Technician / notes</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {c.visits.map((v) => (
                  <VisitRow
                    key={v.id}
                    v={{ id: v.id, due: v.dueDate.toISOString().slice(0, 10), doneAt: v.doneAt?.toISOString().slice(0, 10) ?? "", technician: v.technician ?? "", notes: v.notes ?? "" }}
                  />
                ))}
              </tbody>
            </table>
            {complaints.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <h4 className="mb-1 text-xs font-semibold text-slate-500">Complaints during the contract</h4>
                {complaints.map((x) => (
                  <Link key={x.id} href={`/service/${x.id}`} className="block text-sm text-indigo-600 hover:text-indigo-500">
                    {x.ref} · {dmy(x.registeredAt)} · {x.nature} · {x.status.toLowerCase().replace("_", " ")}
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Units covered ({unitCount})</h3>
          <AmcUnits
            contractId={c.id}
            units={c.units.map((u) => ({ id: u.id, label: `${u.qty} × ${u.model}${u.invoiceNo ? ` · inv ${u.invoiceNo}` : ""}${u.serialNos.length ? ` · S/N ${u.serialNos.join(", ")}` : ""}` }))}
            others={others.map((u) => ({ id: u.id, label: `${u.qty} × ${u.model}${u.invoiceNo ? ` · inv ${u.invoiceNo}` : ""}${u.amcId ? " (under another AMC)" : ""}` }))}
          />
        </Card>
        <Card className="p-4">
          <AmcActions id={c.id} status={status} invoiceNo={c.invoiceNo ?? ""} value={c.value} visitsPerYear={c.visitsPerYear} renewed={!!renewal} />
        </Card>
      </div>
    </div>
  );
}
