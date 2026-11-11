import { prisma } from "@/lib/prisma";
import { LEAD_TIME_DAYS } from "@/lib/model-forecast";
import { ALL } from "@/lib/seasonality-shared";

export * from "@/lib/seasonality-shared";

// The seasonality guide: each product category's monthly pattern from past
// years - each month's share of the year's billing (or units), averaged
// over the last complete years - its peak months, the month to order stock
// by (peak less the Midea lead time) and the pattern for splitting a yearly
// target into months. Billing as in the Sales Register: invoiced product
// lines by category, plus project / service billing.

export const SEASON_YEARS = 3;
export const ORDER_LEAD_MONTHS = Math.round(LEAD_TIME_DAYS / 30);

export type Metric = "value" | "units";
export type SeasonRow = {
  category: string;
  byYear: Record<number, number[]>; // 12 months, value or units
  share: number[]; // 12 months, % of the year (averaged over the complete years)
  yearly: number; // average yearly total over the complete years
  peaks: number[]; // month indexes 0-11, highest first (up to 3)
  orderBy: number[]; // month indexes to order by for each peak
};
export type Seasonality = { years: number[]; complete: number[]; thisYear: number; rows: SeasonRow[] };

const empty = () => Array<number>(12).fill(0);

export async function getSeasonality(metric: Metric, now = new Date()): Promise<Seasonality> {
  const thisYear = now.getUTCFullYear();
  const complete = Array.from({ length: SEASON_YEARS }, (_, i) => thisYear - SEASON_YEARS + i);
  const years = [...complete, thisYear];
  const from = new Date(Date.UTC(complete[0], 0, 1));
  const to = new Date(Date.UTC(thisYear + 1, 0, 1));
  const [lines, projects] = await Promise.all([
    prisma.saleLineItem.findMany({ where: { docDate: { gte: from, lt: to } }, select: { docDate: true, qty: true, value: true, product: { select: { category: true } } } }),
    metric === "value" ? prisma.projectBilling.findMany({ where: { docDate: { gte: from, lt: to } }, select: { docDate: true, value: true } }) : Promise.resolve([]),
  ]);

  const data = new Map<string, Record<number, number[]>>();
  const add = (category: string, d: Date, v: number) => {
    for (const c of [category, ALL]) {
      const byYear = data.get(c) ?? Object.fromEntries(years.map((y) => [y, empty()]));
      byYear[d.getUTCFullYear()][d.getUTCMonth()] += v;
      data.set(c, byYear);
    }
  };
  for (const l of lines) add(l.product.category, l.docDate, metric === "value" ? l.value : l.qty);
  for (const p of projects) add("Project & Service", p.docDate, p.value);

  const rows: SeasonRow[] = [...data].map(([category, byYear]) => {
    // Average each month's share over the complete years that had sales.
    const used = complete.filter((y) => byYear[y].reduce((s, v) => s + v, 0) > 0);
    const share = empty();
    for (const y of used) {
      const total = byYear[y].reduce((s, v) => s + v, 0);
      byYear[y].forEach((v, m) => (share[m] += (v / total) * 100));
    }
    if (used.length) share.forEach((_, m) => (share[m] /= used.length));
    const yearly = used.length ? used.reduce((s, y) => s + byYear[y].reduce((a, v) => a + v, 0), 0) / used.length : 0;
    // Peaks: the top three months, if clearly above an even spread (8.3%).
    const peaks = share
      .map((s, m) => ({ s, m }))
      .filter((x) => x.s > 100 / 12 + 0.5)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((x) => x.m);
    return { category, byYear, share, yearly, peaks, orderBy: peaks.map((m) => (m - ORDER_LEAD_MONTHS + 12) % 12) };
  });
  rows.sort((a, b) => (a.category === ALL ? -1 : b.category === ALL ? 1 : b.yearly - a.yearly));
  return { years, complete, thisYear, rows: rows.filter((r) => r.yearly > 0 || r.byYear[thisYear].some((v) => v)) };
}
