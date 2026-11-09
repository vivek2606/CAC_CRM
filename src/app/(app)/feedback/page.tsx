import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, isBackOffice } from "@/lib/rbac";
import { blockServiceManager } from "@/lib/service-access";
import { PageHeader, Card } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { FEEDBACK_KIND_LABEL, LOW_RATING, RATING_LABEL, feedbackToAsk } from "@/lib/feedback";
import { Stars } from "./feedback-card";

// Customer feedback: the ratings customers gave after delivery or
// installation, the average and the share happy (4-5 stars), unhappy ones
// first; and orders still to ask. A sales person sees their own.
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await blockServiceManager();
  const user = await requireUser();
  const backOffice = isBackOffice(user);
  const days = [30, 90, 365].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 90;
  const since = new Date(new Date().getTime() - days * 86400000);
  const own = backOffice ? {} : { deal: { ownerId: user.id } };
  const [answered, waiting, toAsk] = await Promise.all([
    prisma.customerFeedback.findMany({
      where: { ...own, respondedAt: { gte: since } },
      orderBy: [{ rating: "asc" }, { respondedAt: "desc" }],
      select: { id: true, kind: true, rating: true, comment: true, respondedAt: true, deal: { select: { id: true, title: true, customerName: true, account: { select: { name: true } }, owner: { select: { name: true } } } } },
    }),
    prisma.customerFeedback.count({ where: { ...own, respondedAt: null, createdAt: { gte: since } } }),
    feedbackToAsk(backOffice ? null : [user.id]),
  ]);
  const rated = answered.filter((f) => f.rating != null);
  const avg = rated.length ? rated.reduce((s, f) => s + f.rating!, 0) / rated.length : null;
  const happy = rated.length ? Math.round((rated.filter((f) => f.rating! >= 4).length / rated.length) * 100) : null;
  const unhappy = rated.filter((f) => f.rating! <= LOW_RATING).length;
  const tile = (label: string, value: string, sub?: string) => (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
  return (
    <div>
      <PageHeader title="Customer feedback" description={`Ratings after delivery or installation, last ${days} days`} />
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <div className="flex gap-2 text-sm">
          {[30, 90, 365].map((d) => (
            <Link key={d} href={`/feedback?days=${d}`} className={`rounded-lg px-3 py-1.5 ${d === days ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
              {d === 365 ? "12 months" : `${d} days`}
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tile("Average rating", avg == null ? "—" : `${avg.toFixed(1)} / 5`, `${rated.length} answer${rated.length === 1 ? "" : "s"}`)}
          {tile("Happy (4-5 stars)", happy == null ? "—" : `${happy}%`)}
          {tile("Unhappy (1-2 stars)", String(unhappy))}
          {tile("Asked, no answer yet", String(waiting), `${toAsk.length} order${toAsk.length === 1 ? "" : "s"} still to ask`)}
        </div>

        {toAsk.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Delivered or installed - ask for feedback</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {toAsk.map((d) => (
                <li key={d.id} className="flex flex-wrap gap-2 py-1.5">
                  <Link href={`/deals/${d.id}`} className="font-medium text-indigo-700 hover:underline">
                    {d.account?.name ?? d.customerName ?? d.title}
                  </Link>
                  <span className="text-slate-500">{d.title}</span>
                  {backOffice && <span className="ml-auto text-xs text-slate-500">{d.owner.name}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">What customers said</h2>
          {answered.length === 0 ? (
            <p className="text-sm text-slate-500">No feedback in this period.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {answered.map((f) => (
                <li key={f.id} className={`py-2 ${f.rating != null && f.rating <= LOW_RATING ? "bg-rose-50/50" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars n={f.rating ?? 0} />
                    <span className="text-xs text-slate-500">{RATING_LABEL[f.rating ?? 0]}</span>
                    <Link href={`/deals/${f.deal.id}`} className="font-medium text-slate-800 hover:text-indigo-700">
                      {f.deal.account?.name ?? f.deal.customerName ?? f.deal.title}
                    </Link>
                    <span className="ml-auto text-xs text-slate-500">
                      {FEEDBACK_KIND_LABEL[f.kind]} · {formatDate(f.respondedAt)}
                      {backOffice && ` · ${f.deal.owner.name}`}
                    </span>
                  </div>
                  {f.comment && <p className="mt-1 whitespace-pre-line text-slate-700">&ldquo;{f.comment}&rdquo;</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
