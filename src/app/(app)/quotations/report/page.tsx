import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, isBackOffice } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { documentInputSchema, netOf } from "@/lib/sales-document";
import { getLatestPriceByProduct } from "@/lib/pricing";
import { getCompanySettings } from "@/lib/company-profile";
import { visibleQuotationsWhere } from "@/lib/saved-quotes";
import { QuotationTabs } from "../quotation-tabs";

// Quote-to-win: quotations issued, the deals they were for, how many of
// those deals were won or lost, and the average discount quoted below the
// price list - by sales person, and by month.

type Agg = {
  quotes: number;
  quotedValue: number;
  deals: Set<string>;
  won: Set<string>;
  lost: Set<string>;
  wonValue: number;
  listValue: number; // product lines at list price
  quotedAtList: number; // the same lines as quoted (ex-VAT)
};
const empty = (): Agg => ({ quotes: 0, quotedValue: 0, deals: new Set(), won: new Set(), lost: new Set(), wonValue: 0, listValue: 0, quotedAtList: 0 });

function parseMonth(raw: string | undefined, fallback: Date): Date {
  const m = raw?.match(/^(\d{4})-(\d{1,2})$/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)) : fallback;
}
const monthValue = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export default async function QuoteReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const now = new Date();
  const from = parseMonth(params.from, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)));
  const to = parseMonth(params.to, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 1));

  const [quotes, prices, settings] = await Promise.all([
    prisma.quotation.findMany({
      where: { AND: [visibleQuotationsWhere(user), { createdAt: { gte: from, lt: end } }] },
      select: {
        createdAt: true,
        total: true,
        data: true,
        dealId: true,
        owner: { select: { name: true } },
        deal: { select: { stage: true, value: true } },
      },
    }),
    getLatestPriceByProduct(),
    getCompanySettings(),
  ]);

  const byPerson = new Map<string, Agg>();
  const byMonth = new Map<string, Agg>();
  const total = empty();
  const wonCounted = new Set<string>();
  for (const q of quotes) {
    const month = monthValue(q.createdAt);
    const groups = [total, byPerson.get(q.owner.name) ?? empty(), byMonth.get(month) ?? empty()];
    byPerson.set(q.owner.name, groups[1]);
    byMonth.set(month, groups[2]);
    // Discount vs the price list: product-list lines only, ex-VAT.
    let list = 0;
    let quoted = 0;
    const doc = documentInputSchema.safeParse(q.data);
    if (doc.success) {
      const vat = doc.data.vatMode === "inclusive" ? 1 + settings.vatRatePct / 100 : 1;
      for (const r of doc.data.rows) {
        if (r.kind !== "item" || !r.productId || r.qty <= 0) continue;
        const lp = prices.get(r.productId);
        if (lp == null) continue;
        list += r.qty * lp;
        quoted += r.qty * (netOf(r.unitPrice, r.discountPct) / vat);
      }
    }
    for (const g of groups) {
      g.quotes += 1;
      g.quotedValue += q.total;
      g.listValue += list;
      g.quotedAtList += quoted;
      if (q.dealId) {
        g.deals.add(q.dealId);
        if (q.deal?.stage === "WON") g.won.add(q.dealId);
        if (q.deal?.stage === "LOST") g.lost.add(q.dealId);
      }
    }
    // A won deal's value counted once per group.
    if (q.dealId && q.deal?.stage === "WON") {
      for (const [k, g] of [["t", total], [`p${q.owner.name}`, groups[1]], [`m${month}`, groups[2]]] as const) {
        const key = `${k}|${q.dealId}`;
        if (!wonCounted.has(key)) {
          wonCounted.add(key);
          g.wonValue += q.deal.value;
        }
      }
    }
  }

  const people = [...byPerson.entries()].sort((a, b) => b[1].quotedValue - a[1].quotedValue);
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(0)}%` : "—");
  const disc = (g: Agg) => (g.listValue > 0 ? `${Math.max(0, ((g.listValue - g.quotedAtList) / g.listValue) * 100).toFixed(1)}%` : "—");
  const th = "py-2 px-2 font-medium text-right";
  const row = (label: string, g: Agg, bold = false) => (
    <tr key={label} className={bold ? "border-t-2 border-slate-300 font-semibold text-slate-900" : "border-t border-slate-100"}>
      <td className="py-1.5 pr-2 text-left">{label}</td>
      <td className="py-1.5 px-2 text-right tabular-nums">{g.quotes}</td>
      <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(g.quotedValue)}</td>
      <td className="py-1.5 px-2 text-right tabular-nums">{g.deals.size}</td>
      <td className="py-1.5 px-2 text-right tabular-nums text-emerald-700">{g.won.size}</td>
      <td className="py-1.5 px-2 text-right tabular-nums text-rose-700">{g.lost.size}</td>
      <td className="py-1.5 px-2 text-right tabular-nums">{g.deals.size - g.won.size - g.lost.size}</td>
      <td className="py-1.5 px-2 text-right tabular-nums">{pct(g.won.size, g.won.size + g.lost.size)}</td>
      <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(g.wonValue)}</td>
      <td className="py-1.5 pl-2 text-right tabular-nums">{disc(g)}</td>
    </tr>
  );
  const head = (first: string) => (
    <thead>
      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
        <th className="py-2 pr-2 font-medium text-left">{first}</th>
        <th className={th}>Quotes</th>
        <th className={th}>Quoted value</th>
        <th className={th}>Deals quoted</th>
        <th className={th}>Won</th>
        <th className={th}>Lost</th>
        <th className={th}>Open</th>
        <th className={th} title="Won ÷ (won + lost)">Win rate</th>
        <th className={th}>Won value</th>
        <th className="py-2 pl-2 font-medium text-right" title="Product-list lines, quoted rate vs dealer price">Avg discount</th>
      </tr>
    </thead>
  );
  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";

  return (
    <div>
      <PageHeader title="Quotations" description="Quote-to-win: quotes issued, deals won from them, win rate and discount" action={<QuotationTabs active="report" />} />
      <div className="p-6 space-y-4">
        <form className="flex flex-wrap items-end gap-3" action="/quotations/report">
          <label className="text-xs font-medium text-slate-500">
            From
            <input type="month" name="from" defaultValue={monthValue(from)} className={`${field} mt-1 block`} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            To
            <input type="month" name="to" defaultValue={monthValue(to)} className={`${field} mt-1 block`} />
          </label>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Show
          </button>
        </form>
        {quotes.length === 0 ? (
          <Card className="p-5">
            <EmptyState title="No quotations in this period" description="Quotations are counted from the first download." />
          </Card>
        ) : (
          <>
            <Card className="p-5 overflow-x-auto">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">{isBackOffice(user) ? "By sales person" : "Your quotations"}</h2>
              <table className="w-full text-sm">
                {head("Sales person")}
                <tbody>
                  {people.map(([name, g]) => row(name, g))}
                  {people.length > 1 && row("Total", total, true)}
                </tbody>
              </table>
            </Card>
            <Card className="p-5 overflow-x-auto">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">By month quoted</h2>
              <table className="w-full text-sm">
                {head("Month")}
                <tbody>
                  {months.map(([m, g]) => row(monthLabel(new Date(`${m}-01T00:00:00Z`)), g))}
                  {months.length > 1 && row("Total", total, true)}
                </tbody>
              </table>
            </Card>
            <p className="text-xs text-slate-500">
              Won / lost / open: the deals the quotations were linked to, as they stand now. Quotations not linked to a deal count as quotes only -{" "}
              <Link href="/quotations/saved?unlinked=1" className="text-indigo-600 hover:underline">
                link them
              </Link>{" "}
              for a full picture. Average discount compares product-list lines with the current dealer price.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
