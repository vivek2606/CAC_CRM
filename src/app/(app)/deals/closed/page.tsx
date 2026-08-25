import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, Card, Badge, EmptyState, Avatar } from "@/components/ui";
import { Pagination, parsePage } from "@/components/pagination";
import { formatCurrency, formatDate } from "@/lib/format";
import { DEAL_STAGE_LABELS, DEAL_STAGE_COLORS } from "@/lib/constants";
import type { DealStage } from "@prisma/client";

const PAGE_SIZE = 50;

export default async function ClosedDealsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; stage?: string; q?: string }>;
}) {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);
  const params = await searchParams;
  const page = parsePage(params.page);

  const stageFilter =
    params.stage === "WON" || params.stage === "LOST" ? (params.stage as DealStage) : undefined;

  const where = {
    ownerId: { in: ownerIds },
    stage: stageFilter ? stageFilter : { in: ["WON", "LOST"] as DealStage[] },
    ...(params.q ? { title: { contains: params.q } } : {}),
  };

  const [deals, totalCount] = await Promise.all([
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
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Closed Deals"
        description={`${totalCount} won or lost deal${totalCount === 1 ? "" : "s"}`}
        action={
          <Link href="/deals" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← Back to pipeline
          </Link>
        }
      />
      <div className="p-6 space-y-4">
        <form className="flex flex-wrap gap-3 items-center" action="/deals/closed">
          <input
            type="text"
            name="q"
            defaultValue={params.q}
            placeholder="Search title..."
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            name="stage"
            defaultValue={params.stage ?? ""}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Won &amp; Lost</option>
            <option value="WON">Won only</option>
            <option value="LOST">Lost only</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 transition-colors"
          >
            Filter
          </button>
          {(params.q || params.stage) && (
            <Link href="/deals/closed" className="text-sm text-slate-500 hover:text-slate-700">
              Clear
            </Link>
          )}
        </form>

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
            searchParams={{ stage: params.stage, q: params.q }}
          />
        </Card>
      </div>
    </div>
  );
}
