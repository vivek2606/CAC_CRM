import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { ExportCsvButton } from "@/components/export-csv-button";
import { MANUAL_PREFIX, UPLOAD_PREFIX } from "@/lib/project-billing";
import { AddBillingForm, UploadBillingForm, DeleteBillingButton } from "./forms";

// Project & Service billing: what the Sales Register brought in, plus what
// is entered here (by hand or from a sheet) - e.g. from September 2026,
// once sales moved to the CRM. Counts toward targets and incentives for
// sales persons; the Service Manager's goes to Service Billings.

function parseMonth(raw: string | undefined): Date {
  const m = raw?.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
const monthValue = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const sourceOf = (key: string) =>
  key.startsWith(MANUAL_PREFIX) ? "Entered" : key.startsWith(UPLOAD_PREFIX) ? "Uploaded" : "Sales Register";

export default async function ProjectBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; owner?: string }>;
}) {
  await requireBackOffice();
  const params = await searchParams;
  const month = parseMonth(params.month);
  const owners = await prisma.user.findMany({
    where: { isActive: true, OR: [{ title: "Sales Manager" }, { title: "Service Manager" }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, title: true },
  });
  const ownerId = owners.some((o) => o.id === params.owner) ? params.owner! : null;
  const accounts = await prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } });
  const lines = await prisma.projectBilling.findMany({
    where: { month, ...(ownerId ? { ownerId } : {}) },
    orderBy: [{ docDate: "desc" }, { createdAt: "desc" }],
    include: { owner: { select: { name: true } } },
  });

  // Under the Service Manager = service billing; under a sales person =
  // project billing (counted toward their target and incentive).
  const serviceIds = new Set(owners.filter((o) => o.title === "Service Manager").map((o) => o.id));
  const isService = (l: { ownerId: string }) => serviceIds.has(l.ownerId);
  const byOwner = new Map<string, { name: string; project: number; service: number }>();
  for (const l of lines) {
    const e = byOwner.get(l.ownerId) ?? { name: l.owner.name, project: 0, service: 0 };
    if (isService(l)) e.service += l.value;
    else e.project += l.value;
    byOwner.set(l.ownerId, e);
  }
  const total = lines.reduce((s, l) => s + l.value, 0);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const ownerOptions = owners.map((o) => ({ id: o.id, name: o.name, service: o.title === "Service Manager" }));

  return (
    <div>
      <PageHeader
        title="Project & Service Billing"
        description="Under a sales person it is project billing and counts toward their target and incentive; under the Service Manager it is service billing"
      />
      <div className="p-6 space-y-6">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Add billing</h2>
          <AddBillingForm
            owners={ownerOptions}
            accounts={accounts.map((a) => ({ id: a.id, label: a.code ? `${a.name} (${a.code})` : a.name }))}
            today={today}
          />
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Upload from Excel</h2>
          <p className="text-xs text-slate-500 mt-1 mb-3">
            Columns: Date, Invoice No, Customer, Sales Person, Description, Value - Invoice No is required. Customer is matched to
            the account by name or code. Sales Person is matched to the login by name - lines under the Service Manager are service billing, everyone else&apos;s project billing. Uploading the
            same sheet again doesn&apos;t double it.
          </p>
          <UploadBillingForm />
        </Card>

        <form className="flex flex-wrap items-end gap-3" action="/project-billing">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
            <input type="month" name="month" defaultValue={monthValue(month)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Sales person</label>
            <select name="owner" defaultValue={ownerId ?? ""} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="">Everyone</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700">
            Show
          </button>
        </form>

        {byOwner.size > 0 && (
          <Card>
            <div className="p-4 pb-0">
              <h2 className="text-sm font-semibold text-slate-900">{monthLabel(month)} by sales person</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">Sales person</th>
                    <th className="px-3 py-3 font-medium text-right">Project</th>
                    <th className="px-3 py-3 font-medium text-right">Service</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...byOwner.values()]
                    .sort((a, b) => b.project + b.service - (a.project + a.service))
                    .map((o) => (
                      <tr key={o.name}>
                        <td className="px-4 py-2.5 text-slate-800">{o.name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(o.project)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(o.service)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatCurrency(o.project + o.service)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card>
          <div className="flex items-center justify-between p-4 pb-0">
            <h2 className="text-sm font-semibold text-slate-900">
              {monthLabel(month)} - {lines.length} line{lines.length === 1 ? "" : "s"}, {formatCurrency(total)}
            </h2>
            <ExportCsvButton
              filename={`project-service-billing-${monthValue(month)}.csv`}
              headers={["Date", "Invoice No", "Customer", "Sales Person", "Billing", "Description", "Value", "Source"]}
              rows={lines.map((l) => [
                l.docDate.toISOString().slice(0, 10),
                l.docKey.includes("/") ? String(l.txnNo) : l.docKey,
                l.custName,
                l.owner.name,
                isService(l) ? "Service" : "Project",
                l.itemName,
                l.value,
                sourceOf(l.sourceKey),
              ])}
            />
          </div>
          {lines.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No project or service billing this month" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Invoice #</th>
                    <th className="px-3 py-3 font-medium">Customer / detail</th>
                    <th className="px-3 py-3 font-medium">Sales person</th>
                    <th className="px-3 py-3 font-medium text-right">Value</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => {
                    const source = sourceOf(l.sourceKey);
                    return (
                      <tr key={l.id}>
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(l.docDate)}</td>
                        <td className="px-3 py-2.5 text-slate-600 tabular-nums">
                          {source === "Sales Register" ? l.txnNo : l.docKey || "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-slate-800">{l.custName}</div>
                          <div className="text-xs text-slate-400">
                            {isService(l) ? "Service" : "Project"}
                            {l.itemName && l.itemName !== "Project" && l.itemName !== "Service" ? ` · ${l.itemName}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{l.owner.name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{formatCurrency(l.value)}</td>
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                          <span className="text-slate-500">{source}</span>
                          {source !== "Sales Register" && (
                            <div>
                              <DeleteBillingButton id={l.id} label={`${l.custName} ${formatCurrency(l.value)}`} />
                            </div>
                          )}
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
