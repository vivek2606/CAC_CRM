import { prisma } from "@/lib/prisma";

// Billing in USD: each month's billing (as in the Sales Register - invoiced
// product lines, project / service billing, and deals won in the CRM with
// no product lines) and the sales target, converted at that month's
// exchange rate (Settings → Exchange Rate), against the same month last
// year - so growth isn't flattered or hidden by the Naira's moves. A month
// with no rate entered yet uses the nearest month's rate, marked
// provisional.

export type UsdMonth = { key: string; label: string; rate: number | null; provisional: boolean; target: number; sales: number; lyRate: number | null; lyTarget: number; lySales: number };
export type UsdCategory = { category: string; month: number; monthLy: number; ytd: number; ytdLy: number };
export type UsdSales = {
  month: string;
  monthLabel: string;
  year: number;
  hasRates: boolean;
  months: UsdMonth[]; // January to `month`
  current: UsdMonth;
  ytd: { target: number; sales: number; lyTarget: number; lySales: number };
  categories: UsdCategory[];
  provisional: string[]; // months shown at a borrowed rate
};

const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const first = (y: number, m: number) => new Date(Date.UTC(y, m, 1));

export async function getUsdSales(month: string): Promise<UsdSales> {
  const [y, m] = month.split("-").map(Number);
  const end = first(y, m);
  const start = first(y - 1, 0);

  const [rates, lines, projects, bare, targets] = await Promise.all([
    prisma.monthlyExchangeRate.findMany({ where: { rate: { gt: 0 } }, orderBy: { month: "asc" }, select: { month: true, rate: true } }),
    prisma.saleLineItem.findMany({ where: { docDate: { gte: start, lt: end } }, select: { value: true, docDate: true, product: { select: { category: true } } } }),
    prisma.projectBilling.findMany({ where: { docDate: { gte: start, lt: end } }, select: { value: true, docDate: true } }),
    prisma.deal.findMany({ where: { stage: "WON", sourceTxnNo: null, closedAt: { gte: start, lt: end }, items: { none: {} }, lineItems: { none: {} } }, select: { value: true, closedAt: true } }),
    prisma.target.findMany({ where: { month: { gte: start, lt: end } }, select: { month: true, targetValue: true } }),
  ]);

  // The rate for a month: its own, else the nearest month's (provisional).
  const rateBy = new Map(rates.map((r) => [key(r.month), r.rate]));
  const provisional = new Set<string>();
  const rateFor = (k: string): number | null => {
    const own = rateBy.get(k);
    if (own) return own;
    if (!rates.length) return null;
    const t = new Date(`${k}-01T00:00:00Z`).getTime();
    const near = [...rates].sort((a, b) => Math.abs(a.month.getTime() - t) - Math.abs(b.month.getTime() - t) || b.month.getTime() - a.month.getTime())[0];
    provisional.add(k);
    return near.rate;
  };
  const usd = (ngn: number, k: string) => {
    const r = rateFor(k);
    return r ? ngn / r : 0;
  };

  // Naira by month (and by category `${category}|${month}`).
  const billBy = new Map<string, number>();
  const targetBy = new Map<string, number>();
  const catBy = new Map<string, number>();
  const bump = (map: Map<string, number>, k: string, v: number) => map.set(k, (map.get(k) ?? 0) + v);
  const bill = (category: string, d: Date, v: number) => {
    bump(billBy, key(d), v);
    bump(catBy, `${category}|${key(d)}`, v);
  };
  for (const l of lines) bill(l.product.category, l.docDate, l.value);
  for (const p of projects) bill("Project & Service", p.docDate, p.value);
  for (const b of bare) if (b.closedAt) bill("No products listed", b.closedAt, b.value);
  for (const t of targets) bump(targetBy, key(t.month), t.targetValue);

  const months: UsdMonth[] = Array.from({ length: m }, (_, i) => {
    const d = first(y, i);
    const k = key(d);
    const lk = key(first(y - 1, i));
    return {
      key: k,
      label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
      rate: rateFor(k),
      provisional: provisional.has(k),
      target: usd(targetBy.get(k) ?? 0, k),
      sales: usd(billBy.get(k) ?? 0, k),
      lyRate: rateFor(lk),
      lyTarget: usd(targetBy.get(lk) ?? 0, lk),
      lySales: usd(billBy.get(lk) ?? 0, lk),
    };
  });
  const sum = (f: (r: UsdMonth) => number) => months.reduce((s, r) => s + f(r), 0);
  const current = months[m - 1];
  const lyKeys = months.map((r) => `${y - 1}${r.key.slice(4)}`);
  const lyCur = lyKeys[m - 1];

  const cats = new Set([...catBy.keys()].map((k) => k.split("|")[0]));
  const c = (cat: string, k: string) => usd(catBy.get(`${cat}|${k}`) ?? 0, k);
  const categories: UsdCategory[] = [...cats]
    .map((cat) => ({
      category: cat,
      month: c(cat, current.key),
      monthLy: c(cat, lyCur),
      ytd: months.reduce((s, r) => s + c(cat, r.key), 0),
      ytdLy: lyKeys.reduce((s, k) => s + c(cat, k), 0),
    }))
    .filter((x) => x.month || x.monthLy || x.ytd || x.ytdLy)
    .sort((a, b) => b.ytd - a.ytd || b.ytdLy - a.ytdLy);

  return {
    month,
    monthLabel: first(y, m - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
    year: y,
    hasRates: rates.length > 0,
    months,
    current,
    ytd: { target: sum((r) => r.target), sales: sum((r) => r.sales), lyTarget: sum((r) => r.lyTarget), lySales: sum((r) => r.lySales) },
    categories,
    provisional: [...provisional].sort(),
  };
}
