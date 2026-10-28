import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { HISTORY_ACTION, HistoryDetails, historyTime } from "@/components/history-card";

// Every recorded change (the Head): deals and their products, quotations,
// products and their prices, tentative prices, the exchange rate and leads
// - who changed what, when - filtered by kind, person, dates or text.

const KINDS: { key: string; label: string }[] = [
  { key: "", label: "Everything" },
  { key: "deal", label: "Deals" },
  { key: "quote", label: "Quotations" },
  { key: "product", label: "Products & price list" },
  { key: "tentative", label: "Tentative prices" },
  { key: "exchangeRate", label: "Exchange rate" },
  { key: "lead", label: "Leads" },
];
const KIND_LABEL: Record<string, string> = { deal: "Deal", quote: "Quotation", product: "Product", tentative: "Tentative price", exchangeRate: "Exchange rate", lead: "Lead" };
const PAGE = 200;

export default async function ChangeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; user?: string; q?: string; from?: string; to?: string; page?: string }>;
}) {
  await requireHead();
  const sp = await searchParams;
  const kind = KINDS.some((k) => k.key === sp.kind) ? (sp.kind ?? "") : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const day = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);
  const from = day(sp.from);
  const to = day(sp.to);
  const where: Prisma.AuditLogWhereInput = {
    ...(kind ? { entity: kind } : {}),
    ...(sp.user ? { userId: sp.user } : {}),
    ...(sp.q?.trim() ? { details: { contains: sp.q.trim(), mode: "insensitive" } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86400000) } : {}) } } : {}),
  };
  const [rows, total, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: { id: true, entity: true, entityId: true, action: true, details: true, createdAt: true, user: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // The records' names, for the links.
  const idsOf = (e: string) => [...new Set(rows.filter((r) => r.entity === e).map((r) => r.entityId))];
  const [deals, quotes, products, leads] = await Promise.all([
    prisma.deal.findMany({ where: { id: { in: idsOf("deal") } }, select: { id: true, title: true } }),
    prisma.quotation.findMany({ where: { id: { in: idsOf("quote") } }, select: { id: true, ref: true, customerName: true } }),
    prisma.product.findMany({ where: { id: { in: idsOf("product") } }, select: { id: true, model: true } }),
    prisma.lead.findMany({ where: { id: { in: idsOf("lead") } }, select: { id: true, title: true } }),
  ]);
  const names = new Map<string, string>([
    ...deals.map((d) => [`deal:${d.id}`, d.title] as [string, string]),
    ...quotes.map((q) => [`quote:${q.id}`, `${q.ref.startsWith("DRAFT-") ? "Draft" : q.ref} - ${q.customerName}`] as [string, string]),
    ...products.map((p) => [`product:${p.id}`, p.model] as [string, string]),
    ...leads.map((l) => [`lead:${l.id}`, l.title] as [string, string]),
  ]);
  const hrefOf = (e: string, id: string) =>
    e === "deal"
      ? `/deals/${id}`
      : e === "quote"
        ? `/quotations/history/${id}`
        : e === "product"
          ? `/products/${id}`
          : e === "lead"
            ? `/leads/${id}`
            : e === "tentative"
              ? `/products/tentative`
              : e === "exchangeRate"
                ? `/admin/exchange-rate`
                : null;
  const nameOf = (e: string, id: string) =>
    names.get(`${e}:${id}`) ?? (e === "tentative" || e === "exchangeRate" ? id : e === "deal" || e === "quote" || e === "product" || e === "lead" ? "(deleted)" : id);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const all = { kind, user: sp.user, q: sp.q, from: sp.from, to: sp.to, page: String(page), ...patch };
    for (const [k, v] of Object.entries(all)) if (v && !(k === "page" && v === "1")) p.set(k, v);
    return `/admin/change-history?${p.toString()}`;
  };
  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";

  return (
    <div>
      <PageHeader title="Change History" description="Every change to deals, quotations, products and prices - who, what and when (Lagos time)" />
      <div className="p-6 space-y-4">
        <form className="flex flex-wrap items-end gap-3" action="/admin/change-history">
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">What</span>
            <select name="kind" defaultValue={kind} className={field}>
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">Changed by</span>
            <select name="user" defaultValue={sp.user ?? ""} className={field}>
              <option value="">Anyone</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">From date</span>
            <input type="date" name="from" defaultValue={sp.from ?? ""} className={field} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">To date</span>
            <input type="date" name="to" defaultValue={sp.to ?? ""} className={field} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            <span className="mb-1 block">Containing</span>
            <input name="q" defaultValue={sp.q ?? ""} placeholder="e.g. rate, discount, a model, an invoice no." className={`${field} w-64`} />
          </label>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Show
          </button>
          {(kind || sp.user || sp.q || sp.from || sp.to) && (
            <Link href="/admin/change-history" className="py-2 text-sm text-slate-500 hover:text-slate-800">
              Clear
            </Link>
          )}
        </form>

        <Card className="p-4">
          <p className="mb-3 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{total.toLocaleString()}</span> change{total === 1 ? "" : "s"}
            {total > PAGE ? ` · page ${page} of ${Math.ceil(total / PAGE)}` : ""}
          </p>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Nothing recorded for these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Who</th>
                    <th className="py-2 pr-3 font-medium">Record</th>
                    <th className="py-2 pr-3 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const href = hrefOf(r.entity, r.entityId);
                    return (
                      <tr key={r.id} className="align-top">
                        <td className="py-2 pr-3 whitespace-nowrap text-xs text-slate-500">{historyTime(r.createdAt)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap text-slate-700">{r.user.name}</td>
                        <td className="py-2 pr-3 max-w-[240px]">
                          <span className="block text-[10px] uppercase tracking-wide text-slate-400">{KIND_LABEL[r.entity] ?? r.entity}</span>
                          {href ? (
                            <Link href={href} className="font-medium text-indigo-600 hover:text-indigo-500 break-words">
                              {nameOf(r.entity, r.entityId)}
                            </Link>
                          ) : (
                            <span className="text-slate-700">{nameOf(r.entity, r.entityId)}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="font-medium text-slate-800">{HISTORY_ACTION[r.action] ?? r.action}</span>
                          <HistoryDetails details={r.details} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {total > PAGE && (
            <div className="mt-3 flex justify-between text-sm">
              {page > 1 ? (
                <Link href={qs({ page: String(page - 1) })} className="text-indigo-600 hover:text-indigo-700">
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              {page * PAGE < total && (
                <Link href={qs({ page: String(page + 1) })} className="text-indigo-600 hover:text-indigo-700">
                  Older →
                </Link>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
