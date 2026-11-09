import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, isBackOffice } from "@/lib/rbac";
import { PageHeader, Card, Badge } from "@/components/ui";
import { formatCompactCurrency } from "@/lib/format";
import { SALES_TITLE_IN } from "@/lib/team-titles";
import { getGoneQuiet } from "@/lib/win-back";
import { stalledWhere } from "@/lib/stalled";
import { PlanVisitForm, CheckInButton } from "../visit-ui";

// Plan my week: site / customer visits Monday to Saturday, with
// suggestions (gone-quiet customers, stalled deals, deals not visited);
// the Head and Coordinator also see each person's planned vs done.

const DAY = 86400000;
const LAGOS = 3600000;
const lagosDay = (d: Date) => new Date(d.getTime() + LAGOS).toISOString().slice(0, 10);
const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

export default async function PlanWeekPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = lagosDay(new Date());
  // The Monday of the week shown.
  const base = /^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? new Date(`${sp.week}T00:00:00Z`) : new Date(`${today}T00:00:00Z`);
  const monday = new Date(base.getTime() - ((base.getUTCDay() + 6) % 7) * DAY);
  const days = Array.from({ length: 6 }, (_, i) => new Date(monday.getTime() + i * DAY));
  const from = new Date(monday.getTime() - LAGOS);
  const to = new Date(monday.getTime() + 7 * DAY - LAGOS);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const dayLabel = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
  const weekLabel = `${days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} - ${days[5].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
  const backOffice = isBackOffice(user);

  const sixtyDaysAgo = new Date(new Date(`${today}T00:00:00Z`).getTime() - 60 * DAY);
  const [visits, accounts, deals, quiet, stalled, unvisited] = await Promise.all([
    prisma.activity.findMany({
      where: { ownerId: user.id, type: "SITE_VISIT", status: { not: "CANCELLED" }, dueAt: { gte: from, lt: to } },
      orderBy: { dueAt: "asc" },
      select: { id: true, subject: true, dueAt: true, status: true, deal: { select: { id: true } }, account: { select: { id: true } } },
    }),
    prisma.account.findMany({ where: backOffice ? {} : { ownerId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true, city: true }, take: 2000 }),
    prisma.deal.findMany({ where: { ownerId: user.id, stage: { notIn: ["WON", "LOST"] } }, orderBy: { value: "desc" }, select: { id: true, title: true, value: true, account: { select: { name: true } } }, take: 300 }),
    getGoneQuiet([user.id]),
    prisma.deal.findMany({ where: { ownerId: user.id, ...stalledWhere() }, orderBy: { value: "desc" }, select: { id: true, title: true, value: true }, take: 5 }),
    prisma.deal.findMany({
      where: { ownerId: user.id, stage: { in: ["NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION"] }, activities: { none: { type: "SITE_VISIT", createdAt: { gte: sixtyDaysAgo } } } },
      orderBy: { value: "desc" },
      select: { id: true, title: true, value: true },
      take: 5,
    }),
  ]);

  const options = [
    ...deals.map((d) => ({ id: `deal:${d.id}`, label: d.title, hint: `Deal · ${formatCompactCurrency(d.value)}${d.account ? ` · ${d.account.name}` : ""}` })),
    ...accounts.map((a) => ({ id: `account:${a.id}`, label: a.name, hint: `Customer${a.city ? ` · ${a.city}` : ""}` })),
  ];
  const suggestions = [
    ...quiet.slice(0, 4).map((c) => ({ target: `account:${c.accountId}`, label: c.name, why: `no order for ${c.daysQuiet} days` })),
    ...stalled.map((d) => ({ target: `deal:${d.id}`, label: d.title, why: "no contact for 14+ days" })),
    ...unvisited.filter((d) => !stalled.some((s) => s.id === d.id)).map((d) => ({ target: `deal:${d.id}`, label: d.title, why: `${formatCompactCurrency(d.value)}, not visited in 60 days` })),
  ].slice(0, 10);
  const planned = visits.length;
  const doneCount = visits.filter((v) => v.status === "COMPLETED").length;

  // Team: each sales person's visits this week.
  const team = backOffice
    ? await prisma.user.findMany({
        where: { isActive: true, title: SALES_TITLE_IN },
        orderBy: { name: "asc" },
        select: { id: true, name: true, activities: { where: { type: "SITE_VISIT", status: { not: "CANCELLED" }, dueAt: { gte: from, lt: to } }, select: { status: true } } },
      })
    : [];

  const weekLink = (offset: number) => `/my-day/plan?week=${iso(new Date(monday.getTime() + offset * 7 * DAY))}`;
  return (
    <div>
      <PageHeader title="Plan my week" description={`Visits, ${weekLabel}`} />
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={weekLink(-1)} className="text-indigo-600 hover:text-indigo-700">
            ← Previous week
          </Link>
          <Link href="/my-day/plan" className="text-indigo-600 hover:text-indigo-700">
            This week
          </Link>
          <Link href={weekLink(1)} className="text-indigo-600 hover:text-indigo-700">
            Next week →
          </Link>
          <span className="ml-auto text-slate-600">
            {doneCount} of {planned} visit{planned === 1 ? "" : "s"} done
          </span>
        </div>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Add a visit</h2>
          <PlanVisitForm days={days.map((d) => ({ value: iso(d), label: dayLabel(d) }))} options={options} suggestions={suggestions} />
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {days.map((d) => {
            const key = iso(d);
            const mine = visits.filter((v) => v.dueAt && lagosDay(v.dueAt) === key);
            return (
              <Card key={key} className={`p-4 ${key === today ? "ring-2 ring-indigo-300" : ""}`}>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">
                  {dayLabel(d)}
                  {key === today && <span className="ml-2 text-xs font-medium text-indigo-600">Today</span>}
                </h3>
                {mine.length === 0 ? (
                  <p className="text-xs text-slate-400">No visits planned.</p>
                ) : (
                  <ul className="space-y-2">
                    {mine.map((v) => {
                      const href = v.deal ? `/deals/${v.deal.id}` : v.account ? `/accounts/${v.account.id}` : null;
                      const title = v.subject.replace(/^Visit: /, "");
                      return (
                        <li key={v.id} className="text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs tabular-nums text-slate-500">{v.dueAt ? time(v.dueAt) : ""}</span>
                            {href ? (
                              <Link href={href} className="font-medium text-slate-800 hover:text-indigo-700">
                                {title}
                              </Link>
                            ) : (
                              <span className="font-medium text-slate-800">{title}</span>
                            )}
                            {v.status === "COMPLETED" && (
                              <Badge bg="bg-emerald-100" text="text-emerald-700">
                                Done
                              </Badge>
                            )}
                            {v.status === "PENDING" && key < today && (
                              <Badge bg="bg-amber-100" text="text-amber-800">
                                Not checked in
                              </Badge>
                            )}
                          </div>
                          {v.status === "PENDING" && key <= today && (
                            <div className="mt-1">
                              <CheckInButton id={v.id} />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>

        {backOffice && (
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Team visits this week</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-1.5 font-medium">Sales person</th>
                  <th className="py-1.5 text-right font-medium">Planned</th>
                  <th className="py-1.5 text-right font-medium">Done</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {team.map((t) => (
                  <tr key={t.id}>
                    <td className="py-1.5 text-slate-800">{t.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{t.activities.length}</td>
                    <td className="py-1.5 text-right tabular-nums">{t.activities.filter((a) => a.status === "COMPLETED").length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
