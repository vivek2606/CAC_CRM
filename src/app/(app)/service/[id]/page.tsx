import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireService } from "@/lib/service-access";
import { PageHeader, Card } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE, fmtHours, hoursBetween, lagosDateTime, toLagosInput, type ComplaintStatus } from "@/lib/service";
import { ComplaintActions, PartsEditor } from "./complaint-actions";

const dmy = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "-");

export default async function ComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireService();
  const { id } = await params;
  const c = await prisma.serviceComplaint.findUnique({
    where: { id },
    include: { parts: { orderBy: { createdAt: "asc" } }, registeredBy: { select: { name: true } }, deal: { select: { id: true, title: true } } },
  });
  if (!c) notFound();
  const [technicians, partNames, history] = await Promise.all([
    prisma.serviceComplaint.findMany({ where: { technician: { not: null } }, distinct: ["technician"], select: { technician: true } }),
    prisma.serviceComplaintPart.findMany({ distinct: ["name"], select: { name: true }, take: 300 }),
    // Earlier complaints on the same unit / sale.
    c.serialNo || c.dealId
      ? prisma.serviceComplaint.findMany({
          where: { id: { not: c.id }, OR: [...(c.serialNo ? [{ serialNo: c.serialNo }] : []), ...(c.dealId ? [{ dealId: c.dealId }] : [])] },
          orderBy: { registeredAt: "desc" },
          select: { id: true, ref: true, registeredAt: true, nature: true, status: true },
        })
      : Promise.resolve([]),
  ]);
  const status = c.status as ComplaintStatus;
  const partsTotal = (chargeable: boolean, by: "cost" | "price") =>
    c.parts.filter((p) => p.chargeable === chargeable).reduce((s, p) => s + p.qty * (by === "cost" ? p.unitCost : p.unitPrice), 0);
  const billable = c.inWarranty ? partsTotal(true, "price") : c.serviceCharge + partsTotal(true, "price");
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-800">{value}</span>
    </div>
  );

  return (
    <div>
      <PageHeader title={`Complaint ${c.ref}`} description={`${c.customerName} · ${c.nature}`} />
      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS_TONE[status] ?? ""}`}>{STATUS_LABEL[status] ?? c.status}</span>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${c.inWarranty ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {c.inWarranty ? "In warranty - spares free" : "Out of warranty - chargeable"}
          </span>
          {c.priority === "URGENT" && <span className="rounded-full bg-rose-600 px-3 py-1 text-sm font-semibold text-white">Urgent</span>}
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="p-4">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">Customer & unit</h3>
            {row("Customer", c.customerName)}
            {c.contactName && row("Contact", c.contactName)}
            {c.phone && row("Phone", <a href={`tel:${c.phone}`} className="text-indigo-600">{c.phone}</a>)}
            {c.siteAddress && row("Site", c.siteAddress)}
            {row("Model", c.model ?? "-")}
            {row("Serial no.", c.serialNo ?? "-")}
            {row(
              "Invoice",
              c.invoiceNo ? (
                <>
                  {c.deal ? (
                    <Link href={`/deals/${c.deal.id}`} className="text-indigo-600 hover:text-indigo-500">
                      {c.invoiceNo}
                    </Link>
                  ) : (
                    c.invoiceNo
                  )}
                  {c.billingCompany ? ` (${c.billingCompany})` : ""} · {dmy(c.invoiceDate)}
                </>
              ) : (
                "-"
              ),
            )}
            {row("Warranty", c.warrantyUntil ? `${c.warrantyMonths} months, until ${dmy(c.warrantyUntil)}` : "No invoice date")}
            {c.warrantyNote && row("Warranty note", c.warrantyNote)}
          </Card>

          <Card className="p-4">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">Timeline (Lagos time)</h3>
            {row("Registered", `${lagosDateTime(c.registeredAt)} by ${c.registeredBy.name}`)}
            {row("Assigned", c.assignedAt ? `${lagosDateTime(c.assignedAt)} - ${c.technician}` : c.technician ?? "Not yet")}
            {row("First visit", c.attendedAt ? `${lagosDateTime(c.attendedAt)} (${fmtHours(hoursBetween(c.registeredAt, c.attendedAt))})` : "Not yet")}
            {row("Visits", String(c.visits))}
            {row("Resolved", c.resolvedAt ? `${lagosDateTime(c.resolvedAt)} (${fmtHours(hoursBetween(c.registeredAt, c.resolvedAt))})` : "Not yet")}
            {row("Closed", c.closedAt ? lagosDateTime(c.closedAt) : "Not yet")}
            {row("Customer rating", c.feedback ? `${"★".repeat(c.feedback)}${"☆".repeat(5 - c.feedback)}` : "-")}
          </Card>

          <Card className="p-4">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">The fault</h3>
            {row("Nature", c.nature)}
            {c.description && <p className="py-1.5 text-sm text-slate-700">{c.description}</p>}
            {row("Root cause", c.rootCause ?? "-")}
            {row("Resolution", c.resolution ?? "-")}
            {history.length > 0 && (
              <div className="mt-2 border-t border-slate-100 pt-2 text-xs">
                <p className="font-medium text-amber-700">Earlier complaints on this unit / sale:</p>
                {history.map((h) => (
                  <Link key={h.id} href={`/service/${h.id}`} className="block text-indigo-600 hover:text-indigo-500">
                    {h.ref} · {lagosDateTime(h.registeredAt)} · {h.nature}
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Update</h3>
          <ComplaintActions
            id={c.id}
            status={status}
            now={toLagosInput(new Date())}
            technician={c.technician ?? ""}
            technicians={technicians.map((t) => t.technician!)}
            rootCause={c.rootCause ?? ""}
            resolution={c.resolution ?? ""}
            feedback={c.feedback}
            inWarranty={c.inWarranty}
            serviceCharge={c.serviceCharge}
            chargeInvoiceNo={c.chargeInvoiceNo ?? ""}
          />
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Spares & consumables used</h3>
            <p className="text-xs text-slate-500">
              Our cost: {formatCurrency(partsTotal(false, "cost") + partsTotal(true, "cost"))}
              {c.inWarranty ? " (free to the customer - in warranty)" : ""} · Chargeable: {formatCurrency(partsTotal(true, "price"))}
            </p>
          </div>
          <PartsEditor complaintId={c.id} inWarranty={c.inWarranty} parts={c.parts} names={partNames.map((p) => p.name)} />
          {!c.inWarranty && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span>
                To invoice the customer: service charge {formatCurrency(c.serviceCharge)} + spares {formatCurrency(partsTotal(true, "price"))} ={" "}
                <b>{formatCurrency(billable)}</b> (excl. VAT){c.chargeInvoiceNo ? ` · invoiced on ${c.chargeInvoiceNo}` : ""}
              </span>
              <Link href={`/quotations?complaint=${c.id}`} className="ml-auto rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500">
                Prepare service quotation / proforma
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
