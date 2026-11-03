import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireService } from "@/lib/service-access";
import { PageHeader, Card } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { lagosDateTime } from "@/lib/service";
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_TONE, type ClaimStatus } from "@/lib/warranty-claims";
import { ServiceTabs } from "../../service-tabs";
import { ClaimActions, ClaimLines } from "./claim-actions-ui";

const dmy = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "-");

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  await requireService();
  const { id } = await params;
  const c = await prisma.warrantyClaim.findUnique({
    where: { id },
    include: { lines: { orderBy: { id: "asc" } }, createdBy: { select: { name: true } }, complaint: true },
  });
  if (!c) notFound();
  const status = c.status as ClaimStatus;
  const k = c.complaint;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-800">{value}</span>
    </div>
  );
  return (
    <div>
      <PageHeader title={`Warranty claim ${c.ref}`} description={`${c.manufacturer} · ${k.customerName} · ${k.model ?? ""}`} />
      <div className="p-6 space-y-5">
        <ServiceTabs active="claims" />
        <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${CLAIM_STATUS_TONE[status]}`}>{CLAIM_STATUS_LABEL[status]}</span>
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="p-4">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">The unit (for the manufacturer)</h3>
            {row("Complaint", <Link href={`/service/${k.id}`} className="text-indigo-600">{k.ref}</Link>)}
            {row("Customer", k.customerName)}
            {row("Model", k.model ?? "-")}
            {row("Serial no.", k.serialNo ?? "-")}
            {row("Invoice", k.invoiceNo ? `${k.invoiceNo} · ${dmy(k.invoiceDate)}` : "-")}
            {row("Warranty until", dmy(k.warrantyUntil))}
            {row("Complaint", `${k.nature} · ${lagosDateTime(k.registeredAt)}`)}
            {row("Root cause", k.rootCause ?? "-")}
            {row("Work done", k.resolution ?? "-")}
          </Card>
          <Card className="p-4">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">Claim</h3>
            {row("Claimed (our cost)", formatCurrency(c.claimAmount))}
            {row("Manufacturer's claim no.", c.claimNo ?? "-")}
            {row("Submitted", dmy(c.submittedAt))}
            {row("Decided", dmy(c.decidedAt))}
            {c.approvedAmount != null && row("Approved", formatCurrency(c.approvedAmount))}
            {c.reason && row("Rejected because", c.reason)}
            {c.creditedAmount != null && row("Credited", `${formatCurrency(c.creditedAmount)} · ${dmy(c.creditedAt)}${c.creditNoteNo ? ` · CN ${c.creditNoteNo}` : ""}`)}
            {row("Faulty parts returned", c.partsReturned ? `Yes · ${dmy(c.partsReturnedAt)}` : "No")}
            {c.notes && row("Notes", c.notes)}
            {row("Raised by", c.createdBy.name)}
          </Card>
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Parts claimed</h3>
            <ClaimLines claimId={c.id} editable={status === "DRAFT"} lines={c.lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, unitCost: l.unitCost }))} />
          </Card>
        </div>
        <Card className="p-4">
          <ClaimActions
            id={c.id}
            status={status}
            claimNo={c.claimNo ?? ""}
            claimAmount={c.claimAmount}
            approvedAmount={c.approvedAmount}
            partsReturned={c.partsReturned}
            notes={c.notes ?? ""}
          />
        </Card>
      </div>
    </div>
  );
}
