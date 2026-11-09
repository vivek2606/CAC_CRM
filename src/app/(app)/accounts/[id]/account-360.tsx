import Link from "next/link";
import { Stars } from "../../feedback/feedback-card";
import { FEEDBACK_KIND_LABEL } from "@/lib/feedback-labels";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";
import { amcStatus } from "@/lib/amc";
import { PENDING_STATUSES } from "@/lib/service";
import { quietCheck } from "@/lib/win-back";

// Account 360: the customer at a glance - what they've bought (by year,
// top products, last price paid), what's open, and their service picture.

const DAY = 86400000;

export async function Account360({ accountId, canSeeService }: { accountId: string; canSeeService: boolean }) {
  const now = new Date();
  const [lines, openDeals, units, amcs, complaints, feedback] = await Promise.all([
    prisma.saleLineItem.findMany({
      where: { deal: { accountId } },
      orderBy: { docDate: "desc" },
      select: { docDate: true, qty: true, value: true, dealId: true, product: { select: { model: true, category: true } } },
    }),
    prisma.deal.findMany({ where: { accountId, stage: { notIn: ["WON", "LOST"] } }, select: { value: true } }),
    prisma.installedUnit.findMany({ where: { accountId }, select: { qty: true, warrantyUntil: true, amcId: true } }),
    prisma.amcContract.findMany({ where: { accountId }, select: { id: true, ref: true, startDate: true, endDate: true, cancelled: true } }),
    prisma.serviceComplaint.findMany({ where: { accountId }, select: { id: true, status: true, registeredAt: true } }),
    prisma.customerFeedback.findMany({
      where: { deal: { accountId }, respondedAt: { not: null } },
      orderBy: { respondedAt: "desc" },
      take: 20,
      select: { rating: true, comment: true, kind: true, respondedAt: true, dealId: true },
    }),
  ]);
  const avgRating = feedback.length ? feedback.reduce((s, f) => s + (f.rating ?? 0), 0) / feedback.length : null;

  const yearAgo = new Date(now.getTime() - 365 * DAY);
  const lifetime = lines.reduce((s, l) => s + l.value, 0);
  const last12 = lines.filter((l) => l.docDate >= yearAgo).reduce((s, l) => s + l.value, 0);
  const lastPurchase = lines[0]?.docDate ?? null;
  // Invoices (one date per deal) - for "gone quiet".
  const invoiceDates = [...new Map(lines.map((l) => [l.dealId, l.docDate])).values()].filter((d) => d >= new Date(now.getTime() - 456 * DAY));
  const quiet = quietCheck(invoiceDates, now);
  const thisYear = now.getUTCFullYear();
  const years = Array.from({ length: 5 }, (_, i) => thisYear - 4 + i).map((y) => ({ y, v: lines.filter((l) => l.docDate.getUTCFullYear() === y).reduce((s, l) => s + l.value, 0) }));
  const maxYear = Math.max(1, ...years.map((x) => x.v));
  const byProduct = new Map<string, { model: string; category: string | null; qty: number; value: number; lastRate: number; lastDate: Date }>();
  for (const l of lines) {
    const p = byProduct.get(l.product.model) ?? { model: l.product.model, category: l.product.category, qty: 0, value: 0, lastRate: l.qty ? l.value / l.qty : 0, lastDate: l.docDate };
    p.qty += l.qty;
    p.value += l.value;
    byProduct.set(l.product.model, p);
  }
  const top = [...byProduct.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  const openValue = openDeals.reduce((s, d) => s + d.value, 0);
  const unitCount = units.reduce((s, u) => s + u.qty, 0);
  const inWarranty = units.filter((u) => u.warrantyUntil && u.warrantyUntil >= now).reduce((s, u) => s + u.qty, 0);
  const liveAmcs = amcs.filter((a) => ["ACTIVE", "RENEWAL_DUE"].includes(amcStatus(a, now)));
  const openComplaints = complaints.filter((c) => (PENDING_STATUSES as string[]).includes(c.status)).length;
  const complaints12 = complaints.filter((c) => c.registeredAt >= yearAgo).length;

  const tile = (label: string, value: string, sub?: React.ReactNode) => (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">At a glance</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tile("Bought, last 12 months", formatCompactCurrency(last12), `${formatCompactCurrency(lifetime)} in all`)}
        {tile(
          "Last purchase",
          lastPurchase ? formatDate(lastPurchase) : "None yet",
          quiet.quiet ? (
            <span className="font-medium text-amber-700">
              Gone quiet - usually orders every {quiet.usualGapDays} days
            </span>
          ) : lastPurchase ? (
            `${Math.floor((now.getTime() - lastPurchase.getTime()) / DAY)} days ago`
          ) : undefined,
        )}
        {tile("Open pipeline", formatCompactCurrency(openValue), `${openDeals.length} open deal${openDeals.length === 1 ? "" : "s"}`)}
        {tile(
          "Service",
          `${unitCount} unit${unitCount === 1 ? "" : "s"}`,
          `${inWarranty} in warranty · ${liveAmcs.length ? `AMC ${liveAmcs.map((a) => a.ref).join(", ")}` : "no AMC"} · ${openComplaints} open complaint${openComplaints === 1 ? "" : "s"}`,
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Bought by year</h3>
          <div className="space-y-1.5" role="img" aria-label={years.map((x) => `${x.y}: ${formatCompactCurrency(x.v)}`).join(", ")}>
            {years.map((x) => (
              <div key={x.y} className="grid grid-cols-[3rem_1fr_4.5rem] items-center gap-2 text-xs">
                <span className="text-slate-500">{x.y}</span>
                <div className="h-4 rounded bg-slate-50">{x.v > 0 && <div className="h-4 rounded bg-indigo-500" style={{ width: `${Math.max(2, (x.v / maxYear) * 100)}%` }} />}</div>
                <span className="text-right tabular-nums text-slate-700">{x.v ? formatCompactCurrency(x.v) : "-"}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What they buy</h3>
          {top.length === 0 ? (
            <p className="text-sm text-slate-500">No invoiced sales yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="pb-1 font-medium">Model</th>
                  <th className="pb-1 text-right font-medium">Qty</th>
                  <th className="pb-1 text-right font-medium">Value</th>
                  <th className="pb-1 text-right font-medium">Last rate (excl. VAT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {top.map((p) => (
                  <tr key={p.model}>
                    <td className="py-1 text-slate-800">
                      {p.model}
                      {p.category && <span className="ml-1 text-xs text-slate-400">{p.category}</span>}
                    </td>
                    <td className="py-1 text-right tabular-nums">{p.qty.toLocaleString("en-NG", { maximumFractionDigits: 2 })}</td>
                    <td className="py-1 text-right tabular-nums">{formatCompactCurrency(p.value)}</td>
                    <td className="py-1 text-right tabular-nums text-slate-600" title={`On ${formatDate(p.lastDate)}`}>
                      {formatCurrency(p.lastRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {feedback.length > 0 && (
        <div className="mt-4 text-sm">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Feedback - {avgRating!.toFixed(1)} / 5 from {feedback.length} order{feedback.length === 1 ? "" : "s"}
          </h3>
          <ul className="space-y-1">
            {feedback.slice(0, 3).map((f, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2">
                <Stars n={f.rating ?? 0} />
                <span className="text-xs text-slate-500">
                  {FEEDBACK_KIND_LABEL[f.kind]}, {formatDate(f.respondedAt)}
                </span>
                {f.comment && <span className="text-slate-700">&ldquo;{f.comment}&rdquo;</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canSeeService && (complaints.length > 0 || amcs.length > 0 || units.length > 0) && (
        <p className="mt-4 text-xs text-slate-500">
          Service: {complaints12} complaint{complaints12 === 1 ? "" : "s"} in the last 12 months ·{" "}
          <Link href="/service/units" className="text-indigo-600 hover:text-indigo-700">
            installed units
          </Link>
          {liveAmcs.map((a) => (
            <span key={a.id}>
              {" · "}
              <Link href={`/service/amc/${a.id}`} className="text-indigo-600 hover:text-indigo-700">
                {a.ref}
              </Link>
            </span>
          ))}
        </p>
      )}
    </Card>
  );
}
