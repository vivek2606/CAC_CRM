import Link from "next/link";
import { requireUser, isBackOffice } from "@/lib/rbac";
import { blockServiceManager } from "@/lib/service-access";
import { PageHeader, Card, Badge } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";
import { getStockToSell, getIncoming, SLOW_NO_SALE_DAYS, SLOW_COVER_MONTHS, AGED_DAYS, ARRIVED_DAYS, type PastBuyer } from "@/lib/stock-selling";

// Stock to sell: slow-moving or aged models with the customers who bought
// them before, and stock arriving / just arrived with who's waiting for it.
// A sales person sees their own customers; the Head and the Coordinator
// everyone's.

const offer = (b: PastBuyer, model: string, from: string) =>
  `Dear ${b.name},\n\nWe have ${model} in stock now, ready for delivery. You bought it from us before - shall I send you a quotation?\n\nRegards,\n${from}`;

export default async function StockToSellPage() {
  await blockServiceManager();
  const user = await requireUser();
  const all = isBackOffice(user);
  const mine = all ? null : [user.id];
  const [rows, incoming] = await Promise.all([getStockToSell(mine), getIncoming(mine)]);
  const arrived = incoming.filter((i) => i.arrived && i.waiting.length);
  const coming = incoming.filter((i) => !i.arrived);
  const th = "py-1.5 pr-3 text-xs font-medium uppercase tracking-wide text-slate-400";
  const days = (n: number | null, atLeast: boolean) => (n == null ? "—" : `${atLeast ? "over " : ""}${n} days`);

  return (
    <div>
      <PageHeader
        title="Stock to sell"
        description="Models sitting in stock with the customers who bought them before; stock arriving with the customers waiting for it"
        action={
          all ? (
            <a href="/stock/sell/xlsx" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Download Excel
            </a>
          ) : undefined
        }
      />
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        {arrived.length > 0 && (
          <Card className="border-emerald-200 p-5">
            <h2 className="mb-2 text-sm font-semibold text-emerald-800">Arrived in the last {ARRIVED_DAYS} days - customers waiting</h2>
            <IncomingList items={arrived} showOwner={all} />
          </Card>
        )}

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Slow-moving and aged stock ({rows.length} model{rows.length === 1 ? "" : "s"})</h2>
          <p className="mb-3 text-xs text-slate-500">
            Slow: no sale in {SLOW_NO_SALE_DAYS} days, or over {SLOW_COVER_MONTHS} months of stock at the last 6 months&apos; selling rate. Aged: the oldest units in stock for over {AGED_DAYS} days. Open a model for
            the customers who bought it in the last 2 years{all ? "" : " (yours)"} - offer it to them.
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing slow or aged - all stock is moving.</p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {rows.map((r) => (
                <details key={r.productId} className="group">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-slate-50">
                    <span className="font-medium text-slate-800">{r.model}</span>
                    <span className="text-xs text-slate-400">{r.code}</span>
                    {r.aged && (
                      <Badge bg="bg-rose-100" text="text-rose-700">
                        Aged
                      </Badge>
                    )}
                    {r.slow && (
                      <Badge bg="bg-amber-100" text="text-amber-800">
                        Slow
                      </Badge>
                    )}
                    <span className="ml-auto flex flex-wrap gap-x-4 text-xs text-slate-600">
                      <span>
                        <b className="tabular-nums text-slate-900">{r.free}</b> free
                      </span>
                      <span>oldest {days(r.oldestDays, r.ageIsAtLeast)}</span>
                      <span>{r.coverMonths == null ? "no sales in 6 months" : `${r.coverMonths.toFixed(1)} months of stock`}</span>
                      <span>last sold {r.lastSale ? formatDate(r.lastSale) : "never"}</span>
                      <span className="font-medium text-indigo-700">
                        {r.buyers.length} past buyer{r.buyers.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </summary>
                  <div className="bg-slate-50/60 px-3 pb-3">
                    {r.buyers.length === 0 ? (
                      <p className="py-2 text-xs text-slate-500">No one{all ? "" : " of your customers"} bought this model in the last 2 years.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left">
                            <th className={th}>Customer</th>
                            {all && <th className={th}>Sales person</th>}
                            <th className={`${th} text-right`}>Bought</th>
                            <th className={`${th} text-right`}>Last rate</th>
                            <th className={th}>Last bought</th>
                            <th className={th} />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {r.buyers.map((b) => (
                            <tr key={b.key}>
                              <td className="py-1.5 pr-3">
                                {b.accountId ? (
                                  <Link href={`/accounts/${b.accountId}`} className="text-indigo-700 hover:underline">
                                    {b.name}
                                  </Link>
                                ) : (
                                  b.name
                                )}
                              </td>
                              {all && <td className="py-1.5 pr-3 text-slate-600">{b.ownerName}</td>}
                              <td className="py-1.5 pr-3 text-right tabular-nums">{b.qty}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{formatCurrency(b.lastRate)}</td>
                              <td className="py-1.5 pr-3 text-slate-600">{formatDate(b.lastDate)}</td>
                              <td className="py-1.5 text-right whitespace-nowrap">
                                {b.phone && (
                                  <>
                                    <a href={whatsappLink(b.phone, offer(b, r.model, user.name ?? ""))} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-700 hover:underline">
                                      WhatsApp
                                    </a>
                                    <a href={`tel:${b.phone}`} className="ml-3 text-xs font-medium text-indigo-700 hover:underline">
                                      Call
                                    </a>
                                  </>
                                )}
                                {b.accountId && (
                                  <Link href="/my-day/plan" className="ml-3 text-xs font-medium text-slate-600 hover:underline">
                                    Plan a visit
                                  </Link>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">On its way</h2>
          <p className="mb-3 text-xs text-slate-500">In-transit orders with their expected arrival, and who&apos;s waiting: open pending orders and deals lost as &quot;product not available&quot; in the last 6 months. Pre-sell before it lands.</p>
          {coming.length === 0 ? <p className="text-sm text-slate-500">Nothing in transit.</p> : <IncomingList items={coming} showOwner={all} />}
        </Card>
      </div>
    </div>
  );
}

function IncomingList({ items, showOwner }: { items: Awaited<ReturnType<typeof getIncoming>>; showOwner: boolean }) {
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {items.map((i, n) => (
        <li key={n} className="py-2">
          <div className="flex flex-wrap items-center gap-x-3">
            <span className="font-medium text-slate-800">{i.model}</span>
            <span className="text-xs text-slate-400">{i.code}</span>
            <span className="text-xs text-slate-600">
              {i.qty} unit{i.qty === 1 ? "" : "s"} · {i.arrived ? `arrived ${i.date ? formatDate(i.date) : ""}` : i.date ? `due ${formatDate(i.date)}` : "date not known"}
              {i.reference ? ` · ${i.reference}` : ""}
            </span>
          </div>
          {i.waiting.length > 0 ? (
            <ul className="mt-1 space-y-0.5 pl-3 text-xs">
              {i.waiting.map((w) => (
                <li key={`${w.kind}-${w.id}`} className="flex flex-wrap gap-x-2">
                  <Link href={w.href} className="font-medium text-indigo-700 hover:underline">
                    {w.customer}
                  </Link>
                  <span className="text-slate-600">
                    {w.kind === "pending" ? `pending order${w.qty ? `, ${w.qty} units` : ""}${w.paid ? ", paid" : ""}` : `lost - no stock, ${formatDate(w.since)}${w.qty ? `, ${w.qty} units` : ""} - reopen the deal`}
                    {showOwner && ` · ${w.ownerName}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 pl-3 text-xs text-slate-400">No one waiting.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
