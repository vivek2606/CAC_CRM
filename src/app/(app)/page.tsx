import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, Card, Badge, StatCard, EmptyState, Avatar } from "@/components/ui";
import { formatCompactCurrency, formatCurrency, relativeDueLabel } from "@/lib/format";
import {
  DEAL_STAGE_LABELS,
  DEAL_STAGE_COLORS,
  OPEN_DEAL_STAGES,
  ACTIVITY_TYPE_LABELS,
  CLOSED_LEAD_STATUSES,
} from "@/lib/constants";
import { PipelineChart } from "./pipeline-chart";
import { Target, TrendingUp, Wallet, Percent, ArrowRight } from "lucide-react";

export default async function DashboardPage() {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [openDeals, wonThisMonth, closedDeals, activeLeads, upcomingActivities, recentDeals, users] =
    await Promise.all([
      prisma.deal.findMany({
        where: { ownerId: { in: ownerIds }, stage: { in: OPEN_DEAL_STAGES } },
        select: { stage: true, value: true },
      }),
      prisma.deal.aggregate({
        where: { ownerId: { in: ownerIds }, stage: "WON", closedAt: { gte: startOfMonth } },
        _sum: { value: true },
        _count: true,
      }),
      prisma.deal.findMany({
        where: { ownerId: { in: ownerIds }, stage: { in: ["WON", "LOST"] } },
        select: { stage: true },
      }),
      prisma.lead.count({
        where: { ownerId: { in: ownerIds }, status: { notIn: CLOSED_LEAD_STATUSES } },
      }),
      prisma.activity.findMany({
        where: { ownerId: { in: ownerIds }, status: "PENDING" },
        orderBy: { dueAt: "asc" },
        take: 6,
        include: {
          owner: { select: { name: true, avatarColor: true } },
          deal: { select: { title: true } },
          lead: { select: { title: true } },
        },
      }),
      prisma.deal.findMany({
        where: { ownerId: { in: ownerIds } },
        orderBy: { updatedAt: "desc" },
        take: 6,
        include: {
          owner: { select: { name: true, avatarColor: true } },
          account: { select: { name: true } },
        },
      }),
      // Only the core CAC sales team, not historical/other-division reps
      // carrying the same SALES_MANAGER role.
      user.role === "HEAD"
        ? prisma.user.findMany({
            where: { role: "SALES_MANAGER", isActive: true, title: "Sales Manager" },
            include: {
              deals: { select: { stage: true, value: true, closedAt: true } },
            },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
    ]);

  const openPipelineValue = openDeals.reduce((sum, d) => sum + d.value, 0);
  const wonCount = closedDeals.filter((d) => d.stage === "WON").length;
  const winRate = closedDeals.length > 0 ? Math.round((wonCount / closedDeals.length) * 100) : 0;

  const stageData = OPEN_DEAL_STAGES.map((stage) => {
    const deals = openDeals.filter((d) => d.stage === stage);
    return {
      stage: DEAL_STAGE_LABELS[stage],
      value: deals.reduce((s, d) => s + d.value, 0),
      count: deals.length,
    };
  });

  const leaderboard = users
    .map((u) => {
      const open = u.deals.filter((d) => OPEN_DEAL_STAGES.includes(d.stage));
      const won = u.deals.filter((d) => d.stage === "WON" && d.closedAt && d.closedAt >= startOfMonth);
      return {
        id: u.id,
        name: u.name,
        avatarColor: u.avatarColor,
        openValue: open.reduce((s, d) => s + d.value, 0),
        openCount: open.length,
        wonValue: won.reduce((s, d) => s + d.value, 0),
      };
    })
    .sort((a, b) => b.wonValue - a.wonValue || b.openValue - a.openValue);

  return (
    <div>
      <PageHeader
        title={user.role === "HEAD" ? "Team Dashboard" : "My Dashboard"}
        description={
          user.role === "HEAD"
            ? "Full visibility across your 6 sales managers"
            : "Your personal sales cycle overview"
        }
      />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Open Pipeline"
            value={formatCompactCurrency(openPipelineValue)}
            sub={`${openDeals.length} active deals`}
            icon={<Wallet className="h-4 w-4 text-indigo-500" />}
          />
          <StatCard
            label="Won This Month"
            value={formatCompactCurrency(wonThisMonth._sum.value ?? 0)}
            sub={`${wonThisMonth._count} deal${wonThisMonth._count === 1 ? "" : "s"} closed`}
            icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          />
          <StatCard
            label="Active Leads"
            value={String(activeLeads)}
            sub="Not yet converted"
            icon={<Target className="h-4 w-4 text-sky-500" />}
          />
          <StatCard
            label="Win Rate"
            value={`${winRate}%`}
            sub={`${wonCount} of ${closedDeals.length} closed`}
            icon={<Percent className="h-4 w-4 text-amber-500" />}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-900">Open pipeline by stage</h2>
              <Link href="/deals" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                View pipeline <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {openDeals.length > 0 ? (
              <PipelineChart data={stageData} />
            ) : (
              <EmptyState title="No open deals yet" description="Deals in progress will appear here." />
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Upcoming activities</h2>
              <Link href="/activities" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {upcomingActivities.length === 0 ? (
              <EmptyState title="Nothing scheduled" description="You're all caught up." />
            ) : (
              <ul className="space-y-3">
                {upcomingActivities.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <Badge>{ACTIVITY_TYPE_LABELS[a.type]}</Badge>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 truncate">{a.subject}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {a.deal?.title ?? a.lead?.title ?? "—"} · {relativeDueLabel(a.dueAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Recently updated deals</h2>
              <Link href="/deals" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {recentDeals.length === 0 ? (
              <EmptyState title="No deals yet" />
            ) : (
              <div className="divide-y divide-slate-100">
                {recentDeals.map((d) => {
                  const colors = DEAL_STAGE_COLORS[d.stage];
                  return (
                    <Link
                      key={d.id}
                      href={`/deals/${d.id}`}
                      className="flex items-center justify-between py-3 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{d.title}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {d.account?.name ?? "No account"} · {d.owner.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-medium text-slate-700">{formatCurrency(d.value)}</span>
                        <Badge bg={colors.bg} text={colors.text}>
                          {DEAL_STAGE_LABELS[d.stage]}
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          {user.role === "HEAD" && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900">Team leaderboard</h2>
                <Link href="/reports" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                  Full report <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <ul className="space-y-3">
                {leaderboard.map((rep, i) => (
                  <li key={rep.id} className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-400 w-4">{i + 1}</span>
                    <Avatar name={rep.name} color={rep.avatarColor} size={7} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 truncate">{rep.name}</p>
                      <p className="text-xs text-slate-400">
                        {formatCompactCurrency(rep.wonValue)} won this month
                      </p>
                    </div>
                    <span className="text-xs font-medium text-slate-500 shrink-0">
                      {formatCompactCurrency(rep.openValue)} open
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
