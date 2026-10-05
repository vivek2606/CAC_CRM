import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { getAvailableStockByProduct, getInTransitByProduct } from "@/lib/pricing";
import { formatDate } from "@/lib/format";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { ExportCsvButton } from "@/components/export-csv-button";

// Midea lead time: ~30 days manufacturing + ~60 days shipping to the
// warehouse, so stock on hand has to carry ~3 months of sales before a new
// order lands - the target is 3-4 months' worth.
const LEAD_TIME_DAYS = 90;
const WINDOW_OPTIONS = [3, 6, 12] as const;
const COVER_OPTIONS = [3, 4] as const;

function pick<T extends number>(raw: string | undefined, options: readonly T[], fallback: T): T {
  const n = Number(raw);
  return (options as readonly number[]).includes(n) ? (n as T) : fallback;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function ReorderPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; cover?: string; category?: string }>;
}) {
  await requireHead();
  const params = await searchParams;
  const windowMonths = pick(params.window, WINDOW_OPTIONS, 6);
  const coverMonths = pick(params.cover, COVER_OPTIONS, 4);
  const category = params.category ?? "";

  // Average over the last N complete calendar months, so a half-finished
  // current month doesn't drag the average down.
  const now = new Date();
  const windowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - windowMonths, 1));

  const [sold, available, pending, flagged, inTransit] = await Promise.all([
    // Billed quantities, net of returns - Sales Register and CRM-won deals.
    prisma.saleLineItem.groupBy({
      by: ["productId"],
      where: { docDate: { gte: windowStart, lt: windowEnd } },
      _sum: { qty: true },
    }),
    getAvailableStockByProduct(),
    prisma.pendingOrder.groupBy({
      by: ["productId", "paymentReceived"],
      where: { status: "OPEN" },
      _sum: { quantity: true },
    }),
    prisma.dealLineItem.groupBy({
      by: ["productId"],
      where: { deal: { stage: "NEGOTIATION", considerForReorder: true } },
      _sum: { qty: true },
    }),
    getInTransitByProduct(),
  ]);

  const soldBy = new Map(sold.map((s) => [s.productId, s._sum.qty ?? 0]));
  const paidBy = new Map<string, number>();
  const unpaidBy = new Map<string, number>();
  for (const p of pending) (p.paymentReceived ? paidBy : unpaidBy).set(p.productId, p._sum.quantity ?? 0);
  const flaggedBy = new Map(flagged.map((f) => [f.productId, f._sum.qty ?? 0]));

  const productIds = new Set([...soldBy.keys(), ...paidBy.keys(), ...unpaidBy.keys(), ...flaggedBy.keys(), ...inTransit.keys()]);
  const products = await prisma.product.findMany({
    where: { id: { in: Array.from(productIds) } },
    select: { id: true, code: true, model: true, category: true },
  });
  const categories = Array.from(new Set(products.map((p) => p.category))).sort();

  const rows = products
    .filter((p) => !category || p.category === category)
    .map((p) => {
      const avgMonthly = Math.max(0, (soldBy.get(p.id) ?? 0) / windowMonths);
      const stock = available.get(p.id) ?? 0;
      const paid = paidBy.get(p.id) ?? 0;
      const unpaid = unpaidBy.get(p.id) ?? 0;
      const pipeline = flaggedBy.get(p.id) ?? 0;
      const transit = inTransit.get(p.id)?.qty ?? 0;
      const eta = inTransit.get(p.id)?.eta ?? null;
      const targetStock = avgMonthly * coverMonths;
      // Paid pending orders are owed out of the next arrival on top of the
      // normal cover; flagged Negotiation deals are shown separately since
      // they may not close.
      // Units already on the way from the factory count against the order.
      const suggested = Math.max(0, Math.ceil(targetStock + paid - stock - transit));
      const suggestedWithPipeline = Math.max(0, Math.ceil(targetStock + paid + pipeline - stock - transit));
      const monthsCover = avgMonthly > 0 ? Math.max(0, stock - paid) / avgMonthly : null;
      return { ...p, avgMonthly, stock, transit, eta, paid, unpaid, pipeline, targetStock, suggested, suggestedWithPipeline, monthsCover };
    })
    .filter((r) => r.avgMonthly > 0 || r.paid > 0 || r.unpaid > 0 || r.pipeline > 0 || r.transit > 0)
    .sort((a, b) => b.suggestedWithPipeline - a.suggestedWithPipeline || b.avgMonthly - a.avgMonthly);

  const toOrder = rows.filter((r) => r.suggested > 0);
  const totalSuggested = rows.reduce((s, r) => s + r.suggested, 0);
  const totalWithPipeline = rows.reduce((s, r) => s + r.suggestedWithPipeline, 0);
  const lowCover = rows.filter((r) => r.monthsCover != null && r.monthsCover < LEAD_TIME_DAYS / 30).length;
  const fmt = (n: number) => n.toLocaleString("en-NG", { maximumFractionDigits: 1 });
  const href = (over: Record<string, string | number>) => {
    const q = new URLSearchParams({ window: String(windowMonths), cover: String(coverMonths), ...(category ? { category } : {}) });
    for (const [k, v] of Object.entries(over)) {
      if (v === "") q.delete(k);
      else q.set(k, String(v));
    }
    return `/reorder?${q.toString()}`;
  };
  const chip = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`;

  return (
    <div>
      <PageHeader
        title="Reorder Planning"
        description={`What to order from Midea - lead time ~${LEAD_TIME_DAYS} days (30 manufacturing + 60 shipping), keeping ${coverMonths} months of sales in stock`}
        action={
          <Link href="/stock" className="text-sm text-indigo-600 hover:text-indigo-700">
            Stock & pending orders →
          </Link>
        }
      />
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Average sales over</span>
            {WINDOW_OPTIONS.map((w) => (
              <Link key={w} href={href({ window: w })} className={chip(w === windowMonths)}>
                {w} months
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Keep in stock</span>
            {COVER_OPTIONS.map((c) => (
              <Link key={c} href={href({ cover: c })} className={chip(c === coverMonths)}>
                {c} months
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Category</span>
            <Link href={href({ category: "" })} className={chip(!category)}>
              All
            </Link>
            {categories.map((c) => (
              <Link key={c} href={href({ category: c })} className={chip(c === category)}>
                {c}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <p className="text-sm text-slate-500">Items to order</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{toOrder.length}</p>
            <p className="text-xs text-slate-400 mt-1">{fmt(totalSuggested)} units in total</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-slate-500">Including flagged Negotiation deals</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{fmt(totalWithPipeline)} units</p>
            <p className="text-xs text-slate-400 mt-1">If those deals close</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-slate-500">Items with under 3 months&apos; stock</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{lowCover}</p>
            <p className="text-xs text-slate-400 mt-1">Would run out before a new order lands</p>
          </Card>
        </div>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-0">
            <p className="text-xs text-slate-500 max-w-3xl">
              Average monthly sales = units billed {monthLabel(windowStart)} – {monthLabel(new Date(windowEnd.getTime() - 1))},
              net of returns. Suggested order = {coverMonths} months of average sales + paid pending orders − stock now −
              goods in transit. Keep the in-transit list on the Stock page up to date so orders already placed aren&apos;t
              suggested again.
            </p>
            <ExportCsvButton
              filename={`reorder-${now.toISOString().slice(0, 10)}.csv`}
              headers={[
                "Category",
                "Model",
                "Code",
                "Avg monthly sales",
                "Stock now",
                "In transit",
                "Earliest ETA",
                "Months of cover",
                "Pending (paid)",
                "Pending (unpaid)",
                "Flagged in negotiation",
                `Target stock (${coverMonths} mo)`,
                "Suggested order",
                "Suggested incl. negotiation",
              ]}
              rows={rows.map((r) => [
                r.category,
                r.model,
                r.code,
                Math.round(r.avgMonthly * 10) / 10,
                r.stock,
                r.transit,
                r.eta ? r.eta.toISOString().slice(0, 10) : "",
                r.monthsCover == null ? "" : Math.round(r.monthsCover * 10) / 10,
                r.paid,
                r.unpaid,
                r.pipeline,
                Math.ceil(r.targetStock),
                r.suggested,
                r.suggestedWithPipeline,
              ])}
            />
          </div>
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No sales or pending demand in this period" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">Item</th>
                    <th className="px-2.5 py-3 font-medium text-right">Avg / mo</th>
                    <th className="px-2.5 py-3 font-medium text-right">Stock</th>
                    <th className="px-2.5 py-3 font-medium text-right">In transit</th>
                    <th className="px-2.5 py-3 font-medium text-right">Cover (mo)</th>
                    <th className="px-2.5 py-3 font-medium text-right">Paid pending</th>
                    <th className="px-2.5 py-3 font-medium text-right">Unpaid pending</th>
                    <th className="px-2.5 py-3 font-medium text-right">Negotiation</th>
                    <th className="px-2.5 py-3 font-medium text-right">Order</th>
                    <th className="px-4 py-3 font-medium text-right">Order incl. neg.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-800">{r.model}</div>
                        <div className="text-xs text-slate-400">
                          {r.code} · {r.category}
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 text-right tabular-nums text-slate-700">{fmt(r.avgMonthly)}</td>
                      <td className="px-2.5 py-2.5 text-right tabular-nums text-slate-700">{r.stock}</td>
                      <td className="px-2.5 py-2.5 text-right tabular-nums text-slate-700">
                        {r.transit || "—"}
                        {r.eta && <div className="text-[11px] text-slate-400">ETA {formatDate(r.eta)}</div>}
                      </td>
                      <td
                        className={`px-2.5 py-2.5 text-right tabular-nums ${
                          r.monthsCover != null && r.monthsCover < 3 ? "text-rose-600 font-medium" : "text-slate-700"
                        }`}
                      >
                        {r.monthsCover == null ? "—" : fmt(r.monthsCover)}
                      </td>
                      <td className="px-2.5 py-2.5 text-right tabular-nums text-slate-700">{r.paid || "—"}</td>
                      <td className="px-2.5 py-2.5 text-right tabular-nums text-slate-400">{r.unpaid || "—"}</td>
                      <td className="px-2.5 py-2.5 text-right tabular-nums text-slate-700">{r.pipeline || "—"}</td>
                      <td className="px-2.5 py-2.5 text-right tabular-nums font-semibold text-slate-900">{r.suggested || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{r.suggestedWithPipeline || "—"}</td>
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
