import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, Card, Badge, EmptyState, Avatar } from "@/components/ui";
import { Pagination, parsePage } from "@/components/pagination";
import { BackButton } from "@/components/back-button";
import { formatCurrency, formatCompactCurrency, formatDate } from "@/lib/format";
import { DEAL_STAGE_LABELS, DEAL_STAGE_COLORS } from "@/lib/constants";
import type { DealStage } from "@prisma/client";

const PAGE_SIZE = 50;

function monthLabel(monthStr: string): string {
  const m = monthStr.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return monthStr;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
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

  return (
    <div>
      <PageHeader
        title="Closed Deals"
        description={`${totalCount} won or lost deal${totalCount === 1 ? "" : "s"}`}
        action={<BackButton fallbackHref="/deals" label="Back" />}
      />
      <div className="p-6 space-y-4">
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
