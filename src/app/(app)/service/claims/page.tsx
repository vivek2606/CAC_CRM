import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireService } from "@/lib/service-access";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { ExportCsvButton } from "@/components/export-csv-button";
import { formatCurrency } from "@/lib/format";
import { CLAIM_STATUSES, CLAIM_STATUS_LABEL, CLAIM_STATUS_TONE, claimTotals, claimableWhere, notAmcCovered, type ClaimStatus } from "@/lib/warranty-claims";
import { ServiceTabs } from "../service-tabs";
import { RaiseClaimButton } from "./claim-buttons";

// Warranty claims to the manufacturer: spares given free in warranty, what
// was claimed back, approved and credited - and what's still to claim.

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dmy = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "");
const parse = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; status?: string }> }) {
  await requireService();
  const sp = await searchParams;
  const now = new Date();
  const from = parse(sp.from) ?? new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const to = parse(sp.to) ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(to.getTime() + 86400000);
  const status = CLAIM_STATUSES.includes(sp.status as ClaimStatus) ? (sp.status as ClaimStatus) : null;
  // Complaints registered in the period: spares given free, and claims on them.
  const inPeriod = { registeredAt: { gte: new Date(from.getTime() - 3600000), lt: new Date(end.getTime() - 3600000) } };
  const [freeParts, claims, unclaimed] = await Promise.all([
    prisma.serviceComplaintPart.findMany({
      where: { chargeable: false, kind: "SPARE", complaint: { ...inPeriod, inWarranty: true, ...notAmcCovered } },
      select: { qty: true, unitCost: true },
    }),
    prisma.warrantyClaim.findMany({
      where: { complaint: inPeriod },
      orderBy: { createdAt: "desc" },
      include: { complaint: { select: { id: true, ref: true, customerName: true, model: true, serialNo: true, invoiceNo: true, invoiceDate: true, registeredAt: true } }, lines: true },
    }),
    prisma.serviceComplaint.findMany({
      where: { ...claimableWhere, warrantyClaim: null },
      orderBy: { registeredAt: "asc" },
      take: 200,
      select: { id: true, ref: true, customerName: true, model: true, serialNo: true, registeredAt: true, status: true, parts: { where: { chargeable: false, kind: "SPARE" }, select: { name: true, qty: true, unitCost: true } } },
    }),
  ]);
  const given = Math.round(freeParts.reduce((s, p) => s + p.qty * p.unitCost, 0) * 100) / 100;
  const t = claimTotals(claims);
  const shown = status ? claims.filter((c) => c.status === status) : claims;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");
  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";

  return (
    <div>
      <PageHeader title="Warranty Claims" description="Spares replaced free in warranty, claimed back from the manufacturer (Midea) - our cost, excl. VAT" />
      <div className="p-6 space-y-5">
        <ServiceTabs active="claims" />
        <form action="/service/claims" className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">Complaints registered from</span>
            <input type="date" name="from" defaultValue={iso(from)} className={field} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">To</span>
            <input type="date" name="to" defaultValue={iso(to)} className={field} />
          </label>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Show
          </button>
        </form>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Spares given free" value={formatCurrency(given)} sub="In warranty, our cost" accent="slate" />
          <StatCard label="Claimed" value={formatCurrency(t.claimed)} sub={`${pct(t.claimed, given)} of what was given${t.drafts ? ` · ${formatCurrency(t.drafts)} in drafts` : ""}`} accent="indigo" />
          <StatCard label="Waiting for a decision" value={formatCurrency(t.pending)} sub="Submitted, not approved / rejected" accent="sky" />
          <StatCard label="Approved" value={formatCurrency(t.approved)} sub={`${formatCurrency(t.rejected)} rejected`} accent="violet" />
          <StatCard label="Recovered (credited)" value={formatCurrency(t.credited)} sub={`${pct(t.credited, given)} of spares given free`} accent="emerald" />
        </div>

        {unclaimed.length > 0 && (
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold text-amber-800">Not claimed yet ({unclaimed.length}) - spares given free in warranty</h2>
            <ul className="divide-y divide-slate-100">
              {unclaimed.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <Link href={`/service/${c.id}`} className="font-medium text-indigo-600 hover:text-indigo-500">
                    {c.ref}
                  </Link>
                  <span className="text-slate-800">{c.customerName}</span>
                  <span className="text-xs text-slate-500">
                    {c.model ?? "-"} · {c.serialNo ?? "no serial no."} · {c.parts.map((p) => `${p.qty} × ${p.name}`).join(", ")} ·{" "}
                    {formatCurrency(c.parts.reduce((s, p) => s + p.qty * p.unitCost, 0))}
                  </span>
                  <span className="ml-auto">
                    <RaiseClaimButton complaintId={c.id} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
              {[["", "All"], ...CLAIM_STATUSES.map((s) => [s, CLAIM_STATUS_LABEL[s]])].map(([k, l]) => (
                <Link
                  key={k}
                  href={`/service/claims?${new URLSearchParams({ from: iso(from), to: iso(to), ...(k ? { status: k } : {}) })}`}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${(status ?? "") === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {l}
                </Link>
              ))}
            </div>
            <span className="ml-auto" />
            <ExportCsvButton
              filename={`warranty-claims-${iso(from)}-${iso(to)}.csv`}
              headers={["Claim", "Status", "Complaint", "Registered", "Customer", "Model", "Serial no.", "Invoice", "Invoice date", "Parts", "Claimed", "Claim no.", "Submitted", "Approved", "Credited", "Credit note", "Parts returned"]}
              rows={shown.map((c) => [
                c.ref,
                CLAIM_STATUS_LABEL[c.status as ClaimStatus] ?? c.status,
                c.complaint.ref,
                dmy(c.complaint.registeredAt),
                c.complaint.customerName,
                c.complaint.model ?? "",
                c.complaint.serialNo ?? "",
                c.complaint.invoiceNo ?? "",
                dmy(c.complaint.invoiceDate),
                c.lines.map((l) => `${l.qty} x ${l.name}`).join("; "),
                c.claimAmount,
                c.claimNo ?? "",
                dmy(c.submittedAt),
                c.approvedAmount ?? "",
                c.creditedAmount ?? "",
                c.creditNoteNo ?? "",
                c.partsReturned ? "Yes" : "No",
              ])}
            />
          </div>
          {shown.length === 0 ? (
            <EmptyState title="No claims" description="Raise one from a complaint with spares given free in warranty." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3 font-medium">Claim</th>
                    <th className="py-2 pr-3 font-medium">Customer / unit</th>
                    <th className="py-2 pr-3 font-medium">Parts</th>
                    <th className="py-2 pr-3 text-right font-medium">Claimed</th>
                    <th className="py-2 pr-3 text-right font-medium">Credited</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((c) => (
                    <tr key={c.id} className="align-top hover:bg-slate-50">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <Link href={`/service/claims/${c.id}`} className="font-medium text-indigo-600 hover:text-indigo-500">
                          {c.ref}
                        </Link>
                        <div className="text-xs text-slate-400">{c.claimNo ? `Midea ${c.claimNo}` : c.complaint.ref}</div>
                      </td>
                      <td className="py-2 pr-3">
                        {c.complaint.customerName}
                        <div className="text-xs text-slate-500">
                          {c.complaint.model ?? "-"} · S/N {c.complaint.serialNo ?? "-"}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-600">{c.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(c.claimAmount)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.creditedAmount != null ? formatCurrency(c.creditedAmount) : "-"}</td>
                      <td className="py-2 pr-3 text-xs whitespace-nowrap">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${CLAIM_STATUS_TONE[c.status as ClaimStatus] ?? ""}`}>{CLAIM_STATUS_LABEL[c.status as ClaimStatus] ?? c.status}</span>
                        {c.submittedAt && <div className="mt-0.5 text-slate-400">sent {dmy(c.submittedAt)}</div>}
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
