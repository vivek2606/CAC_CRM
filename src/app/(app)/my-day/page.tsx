import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, isBackOffice } from "@/lib/rbac";
import { PageHeader, Card, Badge } from "@/components/ui";
import { formatCompactCurrency, formatDate } from "@/lib/format";
import { ActivityRow } from "../activity-row";
import { FollowUpList } from "../quotations/follow-ups/follow-up-list";
import { getQuoteFollowUps, followUpItems } from "@/lib/quote-followups";
import { stalledWhere, lastContact, daysSince } from "@/lib/stalled";
import { getGoneQuiet } from "@/lib/win-back";
import { canUseService, isServiceManager } from "@/lib/service-access";
import { getSla, slaSummary, STAGE_LABEL } from "@/lib/service-sla";
import { PENDING_STATUSES } from "@/lib/service";
import { CheckInButton } from "./visit-ui";
import { getStandards, weeklyCounts } from "@/lib/activity-standards";
import { Scorecard, ScorecardLink } from "../standards/scorecard";


// My Day: everything to do today in one list - activities due, quotations
// to follow up, deals and customers to call; for the Service Manager also
// complaints against their service levels, installations and AMC visits.

const DAY = 86400000;
const activitySelect = {
  id: true,
  type: true,
  subject: true,
  description: true,
  dueAt: true,
  status: true,
  completedAt: true,
  callOutcome: true,
  deal: { select: { id: true, title: true } },
  lead: { select: { id: true, title: true } },
  account: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
} as const;

function related(a: { deal: { id: string; title: string } | null; lead: { id: string; title: string } | null; account: { id: string; name: string } | null; contact: { id: string; firstName: string; lastName: string } | null }) {
  if (a.deal) return { href: `/deals/${a.deal.id}`, label: a.deal.title };
  if (a.lead) return { href: `/leads/${a.lead.id}`, label: a.lead.title };
  if (a.contact) return { href: `/contacts/${a.contact.id}`, label: `${a.contact.firstName} ${a.contact.lastName}` };
  if (a.account) return { href: `/accounts/${a.account.id}`, label: a.account.name };
  return null;
}

function Section({ title, count, href, children }: { title: string; count?: number; href?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {count != null && count > 0 && (
          <Badge bg="bg-slate-100" text="text-slate-700">
            {count}
          </Badge>
        )}
        {href && (
          <Link href={href} className="ml-auto text-xs text-indigo-600 hover:text-indigo-700">
            View all
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}
const Nothing = ({ text }: { text: string }) => <p className="text-sm text-slate-500">{text}</p>;

export default async function MyDayPage() {
  const user = await requireUser();
  const now = new Date();
  const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const endOfWeek = new Date(endOfToday.getTime() + 7 * DAY);
  const service = await isServiceManager(user);
  const sales = !service;

  const [dueNow, comingUp, followUps, stalled, quiet] = await Promise.all([
    prisma.activity.findMany({ where: { ownerId: user.id, status: "PENDING", dueAt: { lt: endOfToday } }, orderBy: { dueAt: "asc" }, take: 50, select: activitySelect }),
    prisma.activity.findMany({ where: { ownerId: user.id, status: "PENDING", dueAt: { gte: endOfToday, lt: endOfWeek } }, orderBy: { dueAt: "asc" }, take: 30, select: activitySelect }),
    sales ? getQuoteFollowUps([user.id]) : Promise.resolve([]),
    sales
      ? prisma.deal.findMany({
          where: { ownerId: user.id, ...stalledWhere(now) },
          select: { id: true, title: true, value: true, createdAt: true, account: { select: { name: true } }, activities: { orderBy: { createdAt: "desc" }, take: 5, select: { createdAt: true, completedAt: true } } },
          take: 30,
        })
      : Promise.resolve([]),
    sales ? getGoneQuiet([user.id], now) : Promise.resolve([]),
  ]);
  // Visits due today (or missed) - with Check in; the rest of the list without them.
  const visitsToday = dueNow.filter((a) => a.type === "SITE_VISIT");
  const otherDue = dueNow.filter((a) => a.type !== "SITE_VISIT");
  const stalledSorted = stalled.map((d) => ({ d, last: lastContact(d) })).sort((a, b) => a.last.getTime() - b.last.getTime());

  // Service: complaints against their service levels, installations, AMC visits.
  let serviceBlock: React.ReactNode = null;
  if (await canUseService(user)) {
    const sla = await getSla();
    const [open, installs, visits] = await Promise.all([
      prisma.serviceComplaint.findMany({
        where: { status: { in: PENDING_STATUSES } },
        orderBy: { registeredAt: "asc" },
        select: { id: true, ref: true, customerName: true, priority: true, status: true, registeredAt: true, assignedAt: true, attendedAt: true, resolvedAt: true, technician: true },
        take: 300,
      }),
      prisma.installationJob.findMany({
        where: { OR: [{ status: "PENDING" }, { status: { in: ["SCHEDULED", "IN_PROGRESS"] }, scheduledDate: { lt: endOfToday } }] },
        orderBy: { createdAt: "asc" },
        select: { id: true, ref: true, customerName: true, status: true, scheduledDate: true, team: true },
        take: 30,
      }),
      prisma.amcVisit.findMany({
        where: { doneAt: null, dueDate: { lt: endOfWeek }, contract: { cancelled: false } },
        orderBy: { dueDate: "asc" },
        select: { dueDate: true, contract: { select: { id: true, ref: true, customerName: true } } },
        take: 30,
      }),
    ]);
    const hot = open
      .map((c) => ({ c, s: slaSummary(c, sla, now) }))
      .filter((x) => x.s.state === "breached" || x.s.state === "at_risk")
      .sort((a, b) => (a.s.state === b.s.state ? 0 : a.s.state === "breached" ? -1 : 1));
    if (service || hot.length || installs.length || visits.length)
      serviceBlock = (
        <>
          <Section title="Complaints past or near their service level" count={hot.length} href="/service?status=pending">
            {hot.length === 0 ? (
              <Nothing text="All complaints are within their service levels." />
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {hot.slice(0, 12).map(({ c, s }) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <Link href={`/service/${c.id}`} className="font-medium text-indigo-700 hover:underline">
                      {c.ref}
                    </Link>
                    <span className="text-slate-700">{c.customerName}</span>
                    {c.priority === "URGENT" && <Badge bg="bg-rose-100" text="text-rose-700">Urgent</Badge>}
                    <span className={`ml-auto text-xs font-medium ${s.state === "breached" ? "text-rose-700" : "text-amber-700"}`}>
                      {STAGE_LABEL[s.stage!]} {s.state === "breached" ? "overdue" : "due soon"}
                      {c.technician ? ` · ${c.technician}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Installations to schedule or past their date" count={installs.length} href="/service/installations">
            {installs.length === 0 ? (
              <Nothing text="Nothing waiting." />
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {installs.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <Link href={`/service/installations/${j.id}`} className="font-medium text-indigo-700 hover:underline">
                      {j.ref}
                    </Link>
                    <span className="text-slate-700">{j.customerName}</span>
                    <span className="ml-auto text-xs text-slate-500">{j.status === "PENDING" ? "To schedule" : `Was due ${formatDate(j.scheduledDate!)}${j.team ? ` · ${j.team}` : ""}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="AMC visits due this week" count={visits.length} href="/service/amc">
            {visits.length === 0 ? (
              <Nothing text="None due." />
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {visits.map((v, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 py-1.5">
                    <Link href={`/service/amc/${v.contract.id}`} className="font-medium text-indigo-700 hover:underline">
                      {v.contract.ref}
                    </Link>
                    <span className="text-slate-700">{v.contract.customerName}</span>
                    <span className={`ml-auto text-xs ${v.dueDate < now ? "font-medium text-rose-700" : "text-slate-500"}`}>
                      {v.dueDate < now ? "Overdue - " : "Due "}
                      {formatDate(v.dueDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      );
  }

  const todayLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" });
  // This week against the weekly minimums (sales people).
  const standardsBlock =
    sales && !isBackOffice(user)
      ? await Promise.all([getStandards(), weeklyCounts([user.id], 1, now)]).then(([standards, { byUser }]) => (
          <Section title="This week's activity standards">
            <Scorecard counts={byUser[user.id][0]} standards={standards} compact />
            <div className="mt-2 text-right">
              <ScorecardLink />
            </div>
          </Section>
        ))
      : null;

  return (
    <div>
      <PageHeader
        title="My Day"
        description={`${todayLabel} - what to do today`}
        action={
          <Link href="/my-day/plan" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Plan my week
          </Link>
        }
      />
      <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
        {standardsBlock}
        {visitsToday.length > 0 && (
          <Section title="Visits today" count={visitsToday.length} href="/my-day/plan">
            <ul className="divide-y divide-slate-100 text-sm">
              {visitsToday.map((v) => {
                const rel = related(v);
                return (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="text-xs tabular-nums text-slate-500">
                      {v.dueAt ? v.dueAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }) : ""}
                    </span>
                    {rel ? (
                      <Link href={rel.href} className="font-medium text-slate-800 hover:text-indigo-700">
                        {v.subject.replace(/^Visit: /, "")}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-800">{v.subject}</span>
                    )}
                    {v.dueAt && v.dueAt < new Date(endOfToday.getTime() - DAY) && (
                      <Badge bg="bg-amber-100" text="text-amber-800">
                        Missed - check in or cancel
                      </Badge>
                    )}
                    <span className="ml-auto">
                      <CheckInButton id={v.id} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
        <Section title="Due today and overdue" count={otherDue.length} href="/leads?tab=activities">
          {otherDue.length === 0 ? (
            <Nothing text="Nothing due - plan your next calls and visits from your deals and leads." />
          ) : (
            <div className="divide-y divide-slate-100">
              {otherDue.map((a) => (
                <ActivityRow key={a.id} activity={a} path="/my-day" related={related(a)} />
              ))}
            </div>
          )}
        </Section>

        {sales && (
          <Section title="Quotations to follow up" count={followUps.length} href="/quotations/follow-ups">
            {followUps.length === 0 ? <Nothing text="No quotations waiting for a follow-up." /> : <FollowUpList items={followUpItems(followUps.slice(0, 8))} />}
          </Section>
        )}

        {serviceBlock}

        {sales && (
          <Section title="Call these" count={stalledSorted.length + quiet.length}>
            {stalledSorted.length + quiet.length === 0 ? (
              <Nothing text="No stalled deals or quiet customers." />
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {stalledSorted.map(({ d, last }) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <Badge bg="bg-rose-50" text="text-rose-700">Deal</Badge>
                    <Link href={`/deals/${d.id}`} className="font-medium text-indigo-700 hover:underline">
                      {d.title}
                    </Link>
                    <span className="text-slate-500">{formatCompactCurrency(d.value)}</span>
                    <span className="ml-auto text-xs text-slate-500">No contact for {daysSince(last, now)} days</span>
                  </li>
                ))}
                {quiet.map((c) => (
                  <li key={c.accountId} className="flex flex-wrap items-center gap-2 py-1.5">
                    <Badge bg="bg-amber-50" text="text-amber-800">Customer</Badge>
                    <Link href={`/accounts/${c.accountId}`} className="font-medium text-indigo-700 hover:underline">
                      {c.name}
                    </Link>
                    <span className="ml-auto text-xs text-slate-500">
                      No order for {c.daysQuiet} days (usually every {c.usualGapDays})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section title="Coming up this week" count={comingUp.length}>
          {comingUp.length === 0 ? (
            <Nothing text="Nothing planned for the next 7 days." />
          ) : (
            <div className="divide-y divide-slate-100">
              {comingUp.map((a) => (
                <ActivityRow key={a.id} activity={a} path="/my-day" related={related(a)} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
