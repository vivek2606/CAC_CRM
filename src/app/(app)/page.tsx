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
  STALE_DEAL_DAYS,
} from "@/lib/constants";
import { PipelineChart } from "./pipeline-chart";
import { ActivityTypeIcon } from "./activity-type-icon";
import { Target, TrendingUp, Wallet, Percent, ArrowRight, AlertTriangle } from "lucide-react";

function TargetProgressRow({
  label,
  target,
  actual,
  emphasized,
}: {
  label: string;
  target: number;
  actual: number;
  emphasized?: boolean;
}) {
  const pct = target > 0 ? Math.round((actual / target) * 100) : null;
  const barWidth = Math.min(pct ?? 0, 100);
  const barColor = pct != null && pct >= 100 ? "bg-emerald-500" : "bg-indigo-500";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className={emphasized ? "text-sm font-medium text-slate-800" : "text-sm text-slate-600"}>{label}</span>
        <span className={emphasized ? "text-sm font-semibold text-slate-900" : "text-xs text-slate-500"}>
          {formatCompactCurrency(actual)} / {formatCompactCurrency(target)}
          {pct != null && <span className="ml-1.5 text-slate-400">({pct}%)</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - STALE_DEAL_DAYS);

  // Target.month is an exact UTC first-of-month DateTime (see /targets),
  // computed separately from startOfMonth above since that one isn't
  // guaranteed UTC-aligned and an exact match is required to look targets up.
  const now = new Date();
  const targetMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const targetMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const [
    openDeals,
    wonThisMonth,
    wonYTD,
    closedDeals,
    activeLeads,
    upcomingActivities,
    overdueCount,
    staleDeals,
    recentDeals,
    users,
    targetReps,
  ] = await Promise.all([
    prisma.deal.findMany({
      where: { ownerId: { in: ownerIds }, stage: { in: OPEN_DEAL_STAGES } },
      select: { stage: true, value: true, accountId: true },
    }),
    prisma.deal.aggregate({
      where: { ownerId: { in: ownerIds }, stage: "WON", closedAt: { gte: startOfMonth } },
      _sum: { value: true },
      _count: true,
    }),
    prisma.deal.aggregate({
      where: { ownerId: { in: ownerIds }, stage: "WON", closedAt: { gte: startOfYear } },
      _sum: { value: true },
      _count: true,
    }),
    // Win rate only makes sense over deals actually run through the pipeline
    // here - the historical Sales Register import is a billing export of
    // completed sales only, with no "Lost" counterpart, so including it
    // would always show ~100% regardless of real performance.
    prisma.deal.findMany({
      where: { ownerId: { in: ownerIds }, stage: { in: ["WON", "LOST"] }, sourceTxnNo: null },
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
    prisma.activity.count({
      where: { ownerId: { in: ownerIds }, status: "PENDING", dueAt: { lt: startOfToday } },
    }),
    prisma.deal.findMany({
      where: { ownerId: { in: ownerIds }, stage: { in: OPEN_DEAL_STAGES }, updatedAt: { lt: staleThreshold } },
      orderBy: { updatedAt: "asc" },
      take: 6,
      include: {
        owner: { select: { name: true, avatarColor: true } },
        account: { select: { name: true } },
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
    // Same "core active sales team" definition /targets uses, so target
    // achievement here matches that page exactly.
    user.role === "HEAD"
      ? prisma.user.findMany({
          where: { isActive: true, title: "Sales Manager" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([{ id: user.id, name: user.name ?? "Me" }]),
  ]);

  const targetRepIds = targetReps.map((r) => r.id);
  const [targets, wonForTargets] = await Promise.all([
    prisma.target.findMany({ where: { userId: { in: targetRepIds }, month: targetMonth } }),
    prisma.deal.findMany({
      where: { ownerId: { in: targetRepIds }, stage: "WON", closedAt: { gte: targetMonth, lt: targetMonthEnd } },
      select: { ownerId: true, value: true },
    }),
  ]);
  const targetByUserId = new Map(targets.map((t) => [t.userId, t.targetValue]));
  const actualByUserIdForTarget = new Map<string, number>();
  for (const d of wonForTargets) {
    actualByUserIdForTarget.set(d.ownerId, (actualByUserIdForTarget.get(d.ownerId) ?? 0) + d.value);
  }
  const targetRows = targetReps.map((r) => ({
    id: r.id,
    name: r.name.split(" ")[0],
    target: targetByUserId.get(r.id) ?? 0,
    actual: actualByUserIdForTarget.get(r.id) ?? 0,
  }));
  const totalTarget = targetRows.reduce((s, r) => s + r.target, 0);
  const totalActualForTarget = targetRows.reduce((s, r) => s + r.actual, 0);
  const myTarget = targetByUserId.get(user.id) ?? 0;
  const myActualForTarget = actualByUserIdForTarget.get(user.id) ?? 0;

  const openPipelineValue = openDeals.reduce((sum, d) => sum + d.value, 0);
  const openDealsNoAccount = openDeals.filter((d) => !d.accountId).length;
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
            label="Open Deals"
            value={String(openDeals.length)}
            sub={`${formatCompactCurrency(openPipelineValue)} pipeline value`}
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
            sub={closedDeals.length > 0 ? `${wonCount} of ${closedDeals.length} closed` : "No pipeline deals closed yet"}
            icon={<Percent className="h-4 w-4 text-amber-500" />}
          />
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {user.role === "HEAD" ? "Team target this month" : "My target this month"}
            </h2>
            <Link href="/targets" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              View targets <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {user.role === "HEAD" ? (
            targetRows.length === 0 ? (
              <EmptyState title="No active reps found" />
            ) : totalTarget === 0 && totalActualForTarget === 0 ? (
              <EmptyState title="No targets set for this month" description="Set targets from the Targets page." />
            ) : (
              <div className="space-y-4">
                <TargetProgressRow label="Whole team" target={totalTarget} actual={totalActualForTarget} emphasized />
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  {targetRows.map((r) => (
                    <TargetProgressRow key={r.id} label={r.name} target={r.target} actual={r.actual} />
                  ))}
                </div>
              </div>
            )
          ) : myTarget === 0 && myActualForTarget === 0 ? (
            <EmptyState title="No target set for this month" description="Ask your Head of Sales to set one." />
          ) : (
            <TargetProgressRow label="This month" target={myTarget} actual={myActualForTarget} emphasized />
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-900">Year to date, {now.getUTCFullYear()}</h2>
            <Link href="/reports/category" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Compare years &amp; categories <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCompactCurrency(wonYTD._sum.value ?? 0)}</p>
          <p className="text-xs text-slate-400 mt-1">
            {wonYTD._count} won deal{wonYTD._count === 1 ? "" : "s"} since Jan 1, {user.role === "HEAD" ? "whole department" : "your sales"}
          </p>
        </Card>

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
            {openDealsNoAccount > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                <AlertTriangle className="h-3 w-3 inline -mt-0.5 mr-1 text-amber-500" />
                {openDealsNoAccount} of {openDeals.length} open deal{openDeals.length === 1 ? "" : "s"} (
                {Math.round((openDealsNoAccount / openDeals.length) * 100)}%) have no linked account - harder to
                track by customer or spot duplicates.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Upcoming activities</h2>
                {overdueCount > 0 && (
                  <Badge bg="bg-rose-100" text="text-rose-700">
                    {overdueCount} overdue
                  </Badge>
                )}
              </div>
              <Link href="/activities" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {upcomingActivities.length === 0 ? (
              <EmptyState title="Nothing scheduled" description="You're all caught up." />
            ) : (
              <ul className="space-y-3">
                {upcomingActivities.map((a) => {
                  const isOverdue = a.dueAt != null && a.dueAt < startOfToday;
                  const isToday = a.dueAt != null && a.dueAt >= startOfToday && a.dueAt < endOfToday;
                  return (
                  <li key={a.id} className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <Badge>
                        <span className="inline-flex items-center gap-1">
                          <ActivityTypeIcon type={a.type} />
                          {ACTIVITY_TYPE_LABELS[a.type]}
                        </span>
                      </Badge>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 truncate">{a.subject}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {a.deal?.title ?? a.lead?.title ?? "—"} ·{" "}
                        <span
                          className={
                            isOverdue ? "text-rose-600 font-medium" : isToday ? "text-amber-600 font-medium" : ""
                          }
                        >
                          {relativeDueLabel(a.dueAt)}
                        </span>
                      </p>
                    </div>
                  </li>
                  );
                })}
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

        {staleDeals.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-slate-900">Deals needing attention</h2>
            </div>
            <p className="text-xs text-slate-400 mb-3">No update in {STALE_DEAL_DAYS}+ days.</p>
            <div className="divide-y divide-slate-100">
              {staleDeals.map((d) => (
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
                    <Badge bg="bg-amber-100" text="text-amber-700">
                      {DEAL_STAGE_LABELS[d.stage]}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
