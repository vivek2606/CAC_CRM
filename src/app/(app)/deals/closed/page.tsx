import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, Card, Badge, EmptyState, Avatar, StatCard } from "@/components/ui";
import { Pagination, parsePage } from "@/components/pagination";
import { formatCurrency, formatCompactCurrency, formatDate } from "@/lib/format";
import { DEAL_STAGE_LABELS, DEAL_STAGE_COLORS, LOST_REASONS, LOST_REASON_LABELS, LOST_REASON_COLORS } from "@/lib/constants";
import { WonLostBarChart, type WonLostRow } from "./won-lost-bar-chart";
import { CategoryChart } from "../../reports/category-chart";
import { LostReasonChart } from "../../reports/lost-reason-chart";
import { Percent, Wallet, Receipt, Clock } from "lucide-react";
import type { DealStage } from "@prisma/client";

const PAGE_SIZE = 50;
const TREND_MONTHS = 12;
const TOP_PRODUCTS = 10;

function monthLabel(monthStr: string): string {
  const m = monthStr.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return monthStr;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
}

function shortMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export default async function ClosedDealsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; stage?: string; q?: string; month?: string; owner?: string }>;
}) {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);
  const params = await searchParams;
  const page = parsePage(params.page);

  const stageFilter =
    params.stage === "WON" || params.stage === "LOST" ? (params.stage as DealStage) : undefined;

  const monthMatch = params.month?.match(/^(\d{4})-(\d{1,2})$/);
  const monthRange = monthMatch
    ? {
        gte: new Date(Date.UTC(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1)),
        lt: new Date(Date.UTC(Number(monthMatch[1]), Number(monthMatch[2]), 1)),
      }
    : undefined;

  // Same "individual rep or everyone visible to me" pattern as the Kanban
  // page's own owner filter - Head can narrow to one rep, a rep always
  // just sees their own regardless (visibleOwnerIds already limits them).
  const ownerFilter = { in: params.owner ? [params.owner] : ownerIds };

  const where = {
    ownerId: ownerFilter,
    stage: stageFilter ? stageFilter : { in: ["WON", "LOST"] as DealStage[] },
    ...(params.q ? { title: { contains: params.q } } : {}),
    ...(monthRange ? { closedAt: monthRange } : {}),
  };

  const [deals, totalCount, totalValueAgg, owners] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: { closedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        owner: { select: { name: true, avatarColor: true } },
        account: { select: { name: true } },
      },
    }),
    prisma.deal.count({ where }),
    prisma.deal.aggregate({ where, _sum: { value: true } }),
    // The current 6 active core sales reps, plus Sikiru (Service Manager) -
    // same roster the Kanban page's own owner filter offers.
    user.role === "HEAD"
      ? prisma.user.findMany({
          where: { isActive: true, OR: [{ title: "Sales Manager" }, { title: "Service Manager" }] },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Insights section below is deliberately independent of the list filters
  // above (stage/search/month) - it always covers the last TREND_MONTHS
  // calendar months of Won+Lost deals, scoped by the same owner filter, so
  // switching a single-month filter to inspect one month doesn't collapse
  // the trend down to one bar.
  const insightsNow = new Date();
  const trendMonths = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const idx = insightsNow.getUTCMonth() - (TREND_MONTHS - 1 - i);
    return new Date(Date.UTC(insightsNow.getUTCFullYear(), idx, 1));
  });
  const trendStart = trendMonths[0];
  const trendEnd = new Date(
    Date.UTC(trendMonths[TREND_MONTHS - 1].getUTCFullYear(), trendMonths[TREND_MONTHS - 1].getUTCMonth() + 1, 1)
  );

  const insightsWhere = {
    ownerId: ownerFilter,
    stage: { in: ["WON", "LOST"] as DealStage[] },
    closedAt: { gte: trendStart, lt: trendEnd },
  };

  const [insightDeals, wonLineItems] = await Promise.all([
    prisma.deal.findMany({
      where: insightsWhere,
      select: {
        value: true,
        stage: true,
        closedAt: true,
        createdAt: true,
        ownerId: true,
        lostReasonCategory: true,
        owner: { select: { name: true } },
      },
    }),
    prisma.dealLineItem.findMany({
      where: { deal: { ownerId: ownerFilter, stage: "WON", closedAt: { gte: trendStart, lt: trendEnd } } },
      select: { qty: true, unitPrice: true, product: { select: { code: true, brand: true, model: true } } },
    }),
  ]);

  const wonInsightDeals = insightDeals.filter((d) => d.stage === "WON");
  const lostInsightDeals = insightDeals.filter((d) => d.stage === "LOST");
  const closedInsightCount = wonInsightDeals.length + lostInsightDeals.length;
  const totalWonValue = wonInsightDeals.reduce((s, d) => s + d.value, 0);
  const winRate = closedInsightCount > 0 ? Math.round((wonInsightDeals.length / closedInsightCount) * 100) : null;
  const avgDealSize = wonInsightDeals.length > 0 ? totalWonValue / wonInsightDeals.length : 0;
  const avgCycleDays =
    wonInsightDeals.length > 0
      ? Math.round(
          wonInsightDeals.reduce((s, d) => s + (d.closedAt ? (d.closedAt.getTime() - d.createdAt.getTime()) / 86400000 : 0), 0) /
            wonInsightDeals.length
        )
      : null;

  // Month-wise: Won vs. Lost value, last 12 months.
  const wonByMonth = new Map<string, number>();
  const lostByMonth = new Map<string, number>();
  for (const d of insightDeals) {
    if (!d.closedAt) continue;
    const key = monthKey(d.closedAt);
    if (d.stage === "WON") wonByMonth.set(key, (wonByMonth.get(key) ?? 0) + d.value);
    else lostByMonth.set(key, (lostByMonth.get(key) ?? 0) + d.value);
  }
  const monthTrendRows: WonLostRow[] = trendMonths.map((m) => {
    const key = monthKey(m);
    return { name: shortMonthLabel(m), won: wonByMonth.get(key) ?? 0, lost: lostByMonth.get(key) ?? 0 };
  });

  // Sales-person-wise: Won vs. Lost value, last 12 months - only meaningful
  // as a comparison across the team, so it's Head-only and only shown when
  // the list isn't already narrowed to a single rep.
  const wonByRep = new Map<string, number>();
  const lostByRep = new Map<string, number>();
  for (const d of insightDeals) {
    if (d.stage === "WON") wonByRep.set(d.ownerId, (wonByRep.get(d.ownerId) ?? 0) + d.value);
    else lostByRep.set(d.ownerId, (lostByRep.get(d.ownerId) ?? 0) + d.value);
  }
  const repTrendRows: WonLostRow[] = owners
    .map((o) => ({ name: o.name.split(" ")[0], won: wonByRep.get(o.id) ?? 0, lost: lostByRep.get(o.id) ?? 0 }))
    .sort((a, b) => b.won - a.won);

  // Product-wise: top products by Won value, last 12 months - only deals
  // with itemized line items are represented (see DealLineItem), so a deal
  // won without a product breakup won't appear here.
  const productTotals = new Map<string, { qty: number; value: number }>();
  for (const li of wonLineItems) {
    const key = `${li.product.code} — ${li.product.brand} ${li.product.model}`;
    const g = productTotals.get(key) ?? { qty: 0, value: 0 };
    g.qty += li.qty;
    g.value += li.qty * li.unitPrice;
    productTotals.set(key, g);
  }
  const productRows = Array.from(productTotals.entries())
    .map(([category, v]) => ({ category, value: v.value, qty: v.qty }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_PRODUCTS);

  // Why we lose, last 12 months - same categorization as Team Reports.
  const lostReasonGroups = new Map<string, { count: number; value: number }>();
  for (const d of lostInsightDeals) {
    if (!d.lostReasonCategory) continue;
    const g = lostReasonGroups.get(d.lostReasonCategory) ?? { count: 0, value: 0 };
    g.count += 1;
    g.value += d.value;
    lostReasonGroups.set(d.lostReasonCategory, g);
  }
  const lostReasonData = LOST_REASONS.map((reason) => ({
    reason: LOST_REASON_LABELS[reason],
    count: lostReasonGroups.get(reason)?.count ?? 0,
    value: lostReasonGroups.get(reason)?.value ?? 0,
    fill: LOST_REASON_COLORS[reason],
  }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div>
      <PageHeader
        title="Closed Deals"
        description={`${totalCount} won or lost deal${totalCount === 1 ? "" : "s"}`}
      />
      <div className="p-6 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-900">Insights</h2>
            <span className="text-xs text-slate-400">Last {TREND_MONTHS} months</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <StatCard
              label="Win Rate"
              value={winRate == null ? "—" : `${winRate}%`}
              sub={`${wonInsightDeals.length} won, ${lostInsightDeals.length} lost`}
              icon={<Percent className="h-4 w-4 text-amber-500" />}
              accent="amber"
            />
            <StatCard
              label="Total Won Value"
              value={formatCompactCurrency(totalWonValue)}
              icon={<Wallet className="h-4 w-4 text-emerald-500" />}
              accent="emerald"
            />
            <StatCard
              label="Avg. Deal Size"
              value={formatCompactCurrency(avgDealSize)}
              sub="Won deals"
              icon={<Receipt className="h-4 w-4 text-indigo-500" />}
              accent="indigo"
            />
            <StatCard
              label="Avg. Sales Cycle"
              value={avgCycleDays == null ? "—" : `${avgCycleDays} day${avgCycleDays === 1 ? "" : "s"}`}
              sub="Created to closed, won deals"
              icon={<Clock className="h-4 w-4 text-sky-500" />}
              accent="sky"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Won vs. Lost, month-wise</h3>
              <p className="text-xs text-slate-400 mb-3">Deal value by close month.</p>
              {monthTrendRows.every((r) => r.won === 0 && r.lost === 0) ? (
                <p className="text-sm text-slate-400 py-6 text-center">No closed deals in the last {TREND_MONTHS} months.</p>
              ) : (
                <WonLostBarChart data={monthTrendRows} />
              )}
            </Card>

            {user.role === "HEAD" && !params.owner ? (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-1">Won vs. Lost, sales-person-wise</h3>
                <p className="text-xs text-slate-400 mb-3">Deal value by owner.</p>
                {repTrendRows.every((r) => r.won === 0 && r.lost === 0) ? (
                  <p className="text-sm text-slate-400 py-6 text-center">No closed deals in the last {TREND_MONTHS} months.</p>
                ) : (
                  <WonLostBarChart data={repTrendRows} />
                )}
              </Card>
            ) : (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-1">Why we lose</h3>
                <p className="text-xs text-slate-400 mb-3">Reasons given when a deal is marked Lost.</p>
                {lostReasonData.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">No lost deals with a reason yet.</p>
                ) : (
                  <LostReasonChart data={lostReasonData} />
                )}
              </Card>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Top products, by Won value</h3>
              <p className="text-xs text-slate-400 mb-3">Won deals with itemized products only.</p>
              {productRows.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No itemized won deals in the last {TREND_MONTHS} months.</p>
              ) : (
                <>
                  <CategoryChart data={productRows} />
                  <div className="overflow-x-auto mt-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-400">
                          <th className="px-2 py-1.5 font-medium">Product</th>
                          <th className="px-2 py-1.5 font-medium">Qty</th>
                          <th className="px-2 py-1.5 font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {productRows.map((p) => (
                          <tr key={p.category}>
                            <td className="px-2 py-1.5 text-slate-700">{p.category}</td>
                            <td className="px-2 py-1.5 text-slate-600">{p.qty}</td>
                            <td className="px-2 py-1.5 text-slate-600">{formatCurrency(p.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>

            {user.role === "HEAD" && !params.owner && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-1">Why we lose</h3>
                <p className="text-xs text-slate-400 mb-3">Reasons given when a deal is marked Lost.</p>
                {lostReasonData.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">No lost deals with a reason yet.</p>
                ) : (
                  <LostReasonChart data={lostReasonData} />
                )}
              </Card>
            )}
          </div>
        </div>

        <form className="flex flex-wrap items-end gap-3" action="/deals/closed">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
            <input
              type="text"
              name="q"
              defaultValue={params.q}
              placeholder="Search title..."
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
            <input
              type="month"
              name="month"
              defaultValue={params.month ?? ""}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Stage</label>
            <select
              name="stage"
              defaultValue={params.stage ?? ""}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Won &amp; Lost</option>
              <option value="WON">Won only</option>
              <option value="LOST">Lost only</option>
            </select>
          </div>
          {user.role === "HEAD" && owners.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Sales Person</label>
              <select
                name="owner"
                defaultValue={params.owner ?? ""}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All sales managers</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="submit"
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 transition-colors"
          >
            Filter
          </button>
          {(params.q || params.stage || params.month || params.owner) && (
            <Link href="/deals/closed" className="text-sm text-slate-500 hover:text-slate-700">
              Clear
            </Link>
          )}
        </form>

        <Card className="p-4">
          <p className="text-sm text-slate-500">
            Total value{params.month ? `, ${monthLabel(params.month)}` : ""}
          </p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">
            {formatCompactCurrency(totalValueAgg._sum.value ?? 0)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {totalCount} deal{totalCount === 1 ? "" : "s"}
          </p>
        </Card>

        <Card>
          {deals.length === 0 ? (
            <EmptyState title="No closed deals found" />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Deal</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Closed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deals.map((deal) => {
                  const colors = DEAL_STAGE_COLORS[deal.stage];
                  return (
                    <tr key={deal.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/deals/${deal.id}`} className="font-medium text-slate-800 hover:text-indigo-600">
                          {deal.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{deal.account?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{formatCurrency(deal.value)}</td>
                      <td className="px-4 py-3">
                        <Badge bg={colors.bg} text={colors.text}>
                          {DEAL_STAGE_LABELS[deal.stage]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={deal.owner.name} color={deal.owner.avatarColor} size={6} />
                          <span className="text-slate-600">{deal.owner.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{formatDate(deal.closedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
          <Pagination
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            basePath="/deals/closed"
            searchParams={{ stage: params.stage, q: params.q, month: params.month, owner: params.owner }}
          />
        </Card>
      </div>
    </div>
  );
}
