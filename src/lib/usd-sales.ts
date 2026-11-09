import { prisma } from "@/lib/prisma";
import { getProjectBillings } from "@/lib/project-billing";

// Sales in USD: each month's Naira sales and target converted at that
// month's exchange rate (Settings → Exchange Rate), so growth isn't
// flattered by the Naira falling. Sales = won deals + project billing (as
// on Targets); by product category from the Sales Register lines, plus
// project / service billing and won deals with no products listed. A month
// with no rate entered yet uses the nearest month's rate, marked
// provisional.

export type UsdMonth = { key: string; label: string; rate: number | null; provisional: boolean; target: number; sales: number; lyRate: number | null; lyTarget: number; lySales: number };
export type UsdPerson = { id: string; name: string; target: number; sales: number; ly: number; ytdTarget: number; ytdSales: number; ytdLy: number };
export type UsdCategory = { category: string; month: number; monthLy: number; ytd: number; ytdLy: number };
export type UsdSales = {
  month: string;
  monthLabel: string;
  hasRates: boolean;
  trend: UsdMonth[]; // the 12 months to `month`, oldest first
  current: UsdMonth;
  ytd: { target: number; sales: number; lyTarget: number; lySales: number; months: number };
  people: UsdPerson[];
  categories: UsdCategory[];
  provisional: string[]; // months shown at a borrowed rate
};

const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const first = (y: number, m: number) => new Date(Date.UTC(y, m, 1));
const label = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

export async function getUsdSales(month: string, reps: { id: string; name: string }[]): Promise<UsdSales> {
  const [y, m] = month.split("-").map(Number);
  const sel = first(y, m - 1);
  const end = first(y, m);
  const start = new Date(Math.min(first(y - 1, 0).getTime(), first(y, m - 24).getTime()));
  const ids = reps.map((r) => r.id);
  const owner = { ownerId: { in: ids } };

  const [rates, deals, projects, lines, bare, targets] = await Promise.all([
    prisma.monthlyExchangeRate.findMany({ orderBy: { month: "asc" }, select: { month: true, rate: true } }),
    prisma.deal.findMany({ where: { ...owner, stage: "WON", closedAt: { gte: start, lt: end } }, select: { ownerId: true, value: true, closedAt: true } }),
    getProjectBillings({ in: ids }, start, end),
    prisma.saleLineItem.findMany({ where: { ...owner, docDate: { gte: start, lt: end } }, select: { value: true, docDate: true, product: { select: { category: true } } } }),
    prisma.deal.findMany({
      where: { ...owner, stage: "WON", sourceTxnNo: null, closedAt: { gte: start, lt: end }, items: { none: {} }, lineItems: { none: {} } },
      select: { value: true, closedAt: true },
    }),
    prisma.target.findMany({ where: { userId: { in: ids }, month: { gte: start, lt: end } }, select: { userId: true, month: true, targetValue: true } }),
  ]);

  // The rate for a month: its own, else the nearest month's (provisional).
  const rateBy = new Map(rates.filter((r) => r.rate > 0).map((r) => [key(r.month), r.rate]));
  const provisional = new Set<string>();
  const rateFor = (k: string): number | null => {
    const own = rateBy.get(k);
    if (own) return own;
    if (!rates.length) return null;
    const t = new Date(`${k}-01T00:00:00Z`).getTime();
    const near = rates.filter((r) => r.rate > 0).sort((a, b) => Math.abs(a.month.getTime() - t) - Math.abs(b.month.getTime() - t) || b.month.getTime() - a.month.getTime())[0];
    if (!near) return null;
    provisional.add(k);
    return near.rate;
  };
  const usd = (ngn: number, k: string) => {
    const r = rateFor(k);
    return r ? ngn / r : 0;
  };

  // Naira by month (and by person / category), then to USD per month.
  const salesBy = new Map<string, number>();
  const personSales = new Map<string, number>(); // `${id}|${month}`
  const personTarget = new Map<string, number>();
  const targetBy = new Map<string, number>();
  const catBy = new Map<string, number>(); // `${category}|${month}`
  const bump = (map: Map<string, number>, k: string, v: number) => map.set(k, (map.get(k) ?? 0) + v);
  for (const d of deals) {
    if (!d.closedAt) continue;
    bump(salesBy, key(d.closedAt), d.value);
    bump(personSales, `${d.ownerId}|${key(d.closedAt)}`, d.value);
  }
  for (const p of projects) {
    bump(salesBy, key(p.docDate), p.value);
    bump(personSales, `${p.ownerId}|${key(p.docDate)}`, p.value);
    bump(catBy, `Project & Service|${key(p.docDate)}`, p.value);
  }
  for (const t of targets) {
    bump(targetBy, key(t.month), t.targetValue);
    bump(personTarget, `${t.userId}|${key(t.month)}`, t.targetValue);
  }
  for (const l of lines) bump(catBy, `${l.product.category}|${key(l.docDate)}`, l.value);
  for (const b of bare) if (b.closedAt) bump(catBy, `No products listed|${key(b.closedAt)}`, b.value);

  const monthRow = (d: Date): UsdMonth => {
    const k = key(d);
    const lk = key(first(d.getUTCFullYear() - 1, d.getUTCMonth()));
    return {
      key: k,
      label: label(d),
      rate: rateFor(k),
      provisional: provisional.has(k),
      target: usd(targetBy.get(k) ?? 0, k),
      sales: usd(salesBy.get(k) ?? 0, k),
      lyRate: rateFor(lk),
      lyTarget: usd(targetBy.get(lk) ?? 0, lk),
      lySales: usd(salesBy.get(lk) ?? 0, lk),
    };
  };
  const trend = Array.from({ length: 12 }, (_, i) => monthRow(first(y, m - 12 + i)));
  const ytdMonths = Array.from({ length: m }, (_, i) => monthRow(first(y, i)));
  const ytdKeys = ytdMonths.map((r) => r.key);
  const lyKeys = ytdKeys.map((k) => `${y - 1}${k.slice(4)}`);
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const curKey = key(sel);
  const lyKey = `${y - 1}${curKey.slice(4)}`;

  const people: UsdPerson[] = reps.map((r) => {
    const s = (k: string) => usd(personSales.get(`${r.id}|${k}`) ?? 0, k);
    const t = (k: string) => usd(personTarget.get(`${r.id}|${k}`) ?? 0, k);
    return {
      id: r.id,
      name: r.name,
      target: t(curKey),
      sales: s(curKey),
      ly: s(lyKey),
      ytdTarget: sum(ytdKeys.map(t)),
      ytdSales: sum(ytdKeys.map(s)),
      ytdLy: sum(lyKeys.map(s)),
    };
  });

  const cats = new Set([...catBy.keys()].map((k) => k.split("|")[0]));
  const c = (cat: string, k: string) => usd(catBy.get(`${cat}|${k}`) ?? 0, k);
  const categories: UsdCategory[] = [...cats]
    .map((cat) => ({ category: cat, month: c(cat, curKey), monthLy: c(cat, lyKey), ytd: sum(ytdKeys.map((k) => c(cat, k))), ytdLy: sum(lyKeys.map((k) => c(cat, k))) }))
    .filter((x) => x.month || x.monthLy || x.ytd || x.ytdLy)
    .sort((a, b) => b.ytd - a.ytd || b.ytdLy - a.ytdLy);

  return {
    month,
    monthLabel: sel.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
    hasRates: rateBy.size > 0,
    trend,
    current: trend[11],
    ytd: { target: sum(ytdMonths.map((r) => r.target)), sales: sum(ytdMonths.map((r) => r.sales)), lyTarget: sum(ytdMonths.map((r) => r.lyTarget)), lySales: sum(ytdMonths.map((r) => r.lySales)), months: m },
    people,
    categories,
    provisional: [...provisional].filter((k) => k <= curKey).sort(),
  };
}
