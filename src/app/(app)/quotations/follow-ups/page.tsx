import Link from "next/link";
import { requireUser, isBackOffice } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { quoteSalesPeople } from "@/lib/saved-quotes";
import { getQuoteFollowUps, followUpItems, FOLLOW_UP_DAYS, FOLLOW_UP_RED_DAYS } from "@/lib/quote-followups";
import { QuotationTabs } from "../quotation-tabs";
import { FollowUpList } from "./follow-up-list";

// Quotations sent and not converted, due a follow-up - your own, or (Head /
// Coordinator) the team's, oldest first.
export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ rep?: string }> }) {
  const user = await requireUser();
  const team = isBackOffice(user);
  const { rep = "" } = await searchParams;
  const [list, people] = await Promise.all([getQuoteFollowUps(team ? (rep ? [rep] : null) : [user.id]), team ? quoteSalesPeople() : Promise.resolve([])]);
  const red = list.filter((q) => q.level === "red").length;

  return (
    <div>
      <PageHeader
        title="Quotations"
        description={`Sent and not converted: due a follow-up ${FOLLOW_UP_DAYS} days after sending (red from ${FOLLOW_UP_RED_DAYS} days) until won, lost or followed up`}
      />
      <div className="p-6 space-y-4">
        <QuotationTabs active="followups" />
        {team && (
          <form className="flex items-end gap-2" action="/quotations/follow-ups">
            <select name="rep" defaultValue={rep} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">All sales people</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              Show
            </button>
            {rep && (
              <Link href="/quotations/follow-ups" className="py-2 text-sm text-slate-500 hover:text-slate-800">
                Clear
              </Link>
            )}
          </form>
        )}
        <Card className="p-5">
          <p className="mb-2 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{list.length}</span> quotation{list.length === 1 ? "" : "s"} to follow up
            {red ? <span className="text-rose-600"> · {red} over {FOLLOW_UP_RED_DAYS} days</span> : null}
          </p>
          {list.length === 0 ? (
            <EmptyState title="All followed up" description="No open quotation is waiting on a follow-up." />
          ) : (
            <FollowUpList items={followUpItems(list)} showOwner={team} />
          )}
        </Card>
      </div>
    </div>
  );
}
