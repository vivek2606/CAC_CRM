import Link from "next/link";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { ExportCsvButton } from "@/components/export-csv-button";
import { getApprovalLog, APPROVAL_KINDS, APPROVAL_STATUSES, type ApprovalEntry } from "@/lib/approval-log";

// Every approval in one place: discounts (quotations and deals), stock
// reservations and monthly incentives - who asked, what, why, and the
// Head's decision and note. Filter by period, kind and decision; CSV.
const TONE: Record<string, string> = {
  Approved: "bg-emerald-100 text-emerald-800",
  Rejected: "bg-rose-100 text-rose-700",
  "Sent back": "bg-amber-100 text-amber-800",
  Waiting: "bg-sky-100 text-sky-800",
};

export default async function ApprovalLogPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; kind?: string; status?: string }> }) {
  await requireHead();
  const sp = await searchParams;
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const fromStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)));
  const toStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : iso(now);
  const from = new Date(`${fromStr}T00:00:00Z`);
  const to = new Date(new Date(`${toStr}T00:00:00Z`).getTime() + 86400000);
  const kind = APPROVAL_KINDS.find((k) => k === sp.kind) ?? null;
  const status = APPROVAL_STATUSES.find((s) => s === sp.status) ?? null;
  const all = await getApprovalLog(from, to);
  const rows = all.filter((e) => (!kind || e.kind === kind) && (!status || e.status === status));
  const count = (s: string) => rows.filter((e) => e.status === s).length;
  const sel = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
  const th = "py-2 pr-3 text-xs font-medium uppercase tracking-wide text-slate-400";
  const csv = (e: ApprovalEntry) => [iso(e.date), e.kind, e.status, e.subject, e.requestedBy, e.askedAt ? iso(e.askedAt) : "", e.detail, e.amount ?? "", e.reason, e.decidedBy, e.note];

  return (
    <div>
      <PageHeader title="Approval log" description="Every discount, stock reservation and incentive approval - who asked, why, and your decision" />
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <form action="/admin/approval-log" className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">From</span>
            <input type="date" name="from" defaultValue={fromStr} className={sel} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">To</span>
            <input type="date" name="to" defaultValue={toStr} className={sel} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">Kind</span>
            <select name="kind" defaultValue={kind ?? ""} className={sel}>
              <option value="">All</option>
              {APPROVAL_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">Decision</span>
            <select name="status" defaultValue={status ?? ""} className={sel}>
              <option value="">All</option>
              {APPROVAL_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Show
          </button>
          <span className="ml-auto">
            <ExportCsvButton
              filename={`approval-log-${fromStr}-to-${toStr}.csv`}
              headers={["Decided / asked", "Kind", "Decision", "For", "Asked by", "Asked on", "What", "Amount (NGN)", "Reason given", "Decided by", "Head's note"]}
              rows={rows.map(csv)}
            />
          </span>
        </form>

        <p className="text-sm text-slate-600">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"}: {count("Approved")} approved, {count("Rejected")} rejected
          {count("Sent back") ? `, ${count("Sent back")} sent back` : ""}, {count("Waiting")} waiting.
        </p>

        <Card className="p-0">
          {rows.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Nothing in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className={`${th} pl-4`}>Date</th>
                    <th className={th}>Kind</th>
                    <th className={th}>For</th>
                    <th className={th}>What</th>
                    <th className={`${th} text-right`}>Amount</th>
                    <th className={th}>Reason given</th>
                    <th className={th}>Decision and note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="py-2 pl-4 pr-3 whitespace-nowrap text-slate-600">{formatDate(e.date)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-700">{e.kind}</td>
                      <td className="py-2 pr-3">
                        <Link href={e.href} className="font-medium text-indigo-700 hover:underline">
                          {e.subject}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {e.requestedBy}
                          {e.askedAt && e.status !== "Waiting" ? `, asked ${formatDate(e.askedAt)}` : ""}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-600">{e.detail}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{e.amount != null ? formatCurrency(e.amount) : ""}</td>
                      <td className="py-2 pr-3 text-xs text-slate-700">{e.reason || <span className="text-slate-300">—</span>}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TONE[e.status]}`}>{e.status}</span>
                        {e.decidedBy && <span className="ml-1 text-xs text-slate-500">{e.decidedBy}</span>}
                        {e.note && <div className="mt-0.5 text-xs text-slate-700">{e.note}</div>}
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
