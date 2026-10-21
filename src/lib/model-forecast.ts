import { prisma } from "@/lib/prisma";
import { getAvailableStockByProduct, getInTransitByProduct } from "@/lib/pricing";
import { modelKey, modelCodeOf } from "@/lib/model-family";

// The Midea order, model by model (every code of a model together, its
// type kept apart - see model-family.ts):
//  1. Stock expected at the end of the month before the order lands =
//     stock now + goods in transit (landing Nov-Dec) - paid pending orders
//     - projected sales until then.
//  2. An order placed now ships in January and lands at the start of
//     March; it plus what's left has to cover sales until the end of May.
//     Order = projected sales Mar-May - stock left at the end of Feb.
//  3. Projected sales for a month = the average of the same month over
//     the last few years (since the model's first sale), plus the expected growth for
//     next year's months - 15% for the growth drivers (Atom-C duct and
//     cassette, Floor Standing, VRF).

export type ForecastSettings = {
  arrival: Date; // first of the month the order lands
  coverMonths: number; // months it has to last, from the landing month
  driverGrowthPct: number;
  otherGrowthPct: number;
  yearsBack: number;
};

export type ForecastMonth = { key: string; label: string; base: number; growth: boolean; fraction: number; qty: number };

export type ModelForecast = {
  key: string;
  model: string;
  category: string;
  codes: string[];
  driver: boolean;
  stock: number;
  transit: number;
  eta: Date | null;
  paid: number;
  unpaid: number;
  before: ForecastMonth[]; // now until the order lands
  after: ForecastMonth[]; // the months the order has to cover
  soldBefore: number;
  stockAtArrival: number; // can be negative: short before the order lands
  needAfter: number;
  order: number;
  shortBefore: number;
  history: { year: number; months: number[]; total: number }[]; // this year and the last few
};

export const DEFAULT_GROWTH_PCT = 15;
export const DEFAULT_OTHER_GROWTH_PCT = 0;
export const DEFAULT_YEARS_BACK = 3;
export const DEFAULT_COVER_MONTHS = 3; // March, April, May

// Atom-C duct (concealed) and cassette indoors, Floor Standing and VRF.
export function isGrowthDriver(model: string, category: string): boolean {
  if (category === "VRF" || category === "Floorstanding") return true;
  return /atom-?\s*c\b|\(atc\)/i.test(model) && /cassette|concealed|duct/i.test(model);
}

// An order placed now ships in about three months and lands about two
// after that: the first of the month five months on (October -> March).
export function defaultArrival(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 5, 1));
}

// "2027-03" -> the first of that month, if 1 to 12 months ahead; else the default.
export function parseArrival(raw: string | null | undefined, now = new Date()): Date {
  const m = raw?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return defaultArrival(now);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const ahead = (d.getUTCFullYear() - now.getUTCFullYear()) * 12 + d.getUTCMonth() - now.getUTCMonth();
  return ahead >= 1 && ahead <= 12 ? d : defaultArrival(now);
}

const pct = (raw: string | null | undefined, fallback: number) => {
  const n = Number(raw);
  return raw != null && raw !== "" && Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback;
};

// The settings from the page's / download's query (arrive=2027-03, g=15, go=0).
export function forecastSettings(q: { arrive?: string | null; g?: string | null; go?: string | null }): ForecastSettings {
  return {
    arrival: parseArrival(q.arrive),
    coverMonths: DEFAULT_COVER_MONTHS,
    driverGrowthPct: pct(q.g, DEFAULT_GROWTH_PCT),
    otherGrowthPct: pct(q.go, DEFAULT_OTHER_GROWTH_PCT),
    yearsBack: DEFAULT_YEARS_BACK,
  };
}

export const monthName = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const r1 = (n: number) => Math.round(n * 10) / 10;

export async function getModelForecasts(s: ForecastSettings, onlyKey?: string, now = new Date()): Promise<ModelForecast[]> {
  const y0 = now.getUTCFullYear();
  const m0 = now.getUTCMonth();
  const firstYear = y0 - s.yearsBack;
  const [products, sums, stock, transit, pending] = await Promise.all([
    prisma.product.findMany({ select: { id: true, code: true, model: true, category: true } }),
    prisma.saleLineItem.groupBy({ by: ["productId", "month"], where: { month: { gte: new Date(Date.UTC(firstYear, 0, 1)) } }, _sum: { qty: true } }),
    getAvailableStockByProduct(),
    getInTransitByProduct(),
    prisma.pendingOrder.groupBy({ by: ["productId", "paymentReceived"], where: { status: "OPEN" }, _sum: { quantity: true } }),
  ]);

  const groups = new Map<string, typeof products>();
  for (const p of products) {
    const k = modelKey(p.model);
    if (onlyKey && k !== onlyKey) continue;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const keyOf = new Map<string, string>();
  for (const [k, ps] of groups) for (const p of ps) keyOf.set(p.id, k);
  const sold = new Map<string, Map<string, number>>(); // key -> "YYYY-M" -> qty
  for (const x of sums) {
    const k = keyOf.get(x.productId);
    if (!k) continue;
    const m = sold.get(k) ?? new Map<string, number>();
    const ym = `${x.month.getUTCFullYear()}-${x.month.getUTCMonth()}`;
    m.set(ym, (m.get(ym) ?? 0) + (x._sum.qty ?? 0));
    sold.set(k, m);
  }
  const paidBy = new Map<string, number>();
  const unpaidBy = new Map<string, number>();
  for (const p of pending) {
    const k = keyOf.get(p.productId);
    if (!k) continue;
    const map = p.paymentReceived ? paidBy : unpaidBy;
    map.set(k, (map.get(k) ?? 0) + (p._sum.quantity ?? 0));
  }

  // The months from now to the landing month, and the months it covers.
  const monthsFrom = (from: Date, count: number) => Array.from({ length: count }, (_, i) => new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1)));
  const arrivalIdx = (s.arrival.getUTCFullYear() - y0) * 12 + s.arrival.getUTCMonth() - m0;
  const beforeMonths = monthsFrom(new Date(Date.UTC(y0, m0, 1)), Math.max(0, arrivalIdx));
  const afterMonths = monthsFrom(s.arrival, s.coverMonths);
  const daysIn = new Date(Date.UTC(y0, m0 + 1, 0)).getUTCDate();
  const restOfMonth = (daysIn - now.getUTCDate() + 1) / daysIn;

  const out: ModelForecast[] = [];
  for (const [k, ps] of groups) {
    const m = sold.get(k) ?? new Map<string, number>();
    const q = (y: number, mo: number) => m.get(`${y}-${mo}`) ?? 0;
    // A month counts in the average only from the model's first sale on - a
    // model launched since isn't pulled down by the months before it was sold.
    let firstSale = Infinity;
    for (const [ym, n] of m) {
      const [yy, mm] = ym.split("-").map(Number);
      if (n !== 0) firstSale = Math.min(firstSale, yy * 12 + mm);
    }
    const base = (d: Date) => {
      const years = Array.from({ length: s.yearsBack }, (_, i) => d.getUTCFullYear() - 1 - i).filter((y) => y * 12 + d.getUTCMonth() >= firstSale);
      return years.length ? Math.max(0, years.reduce((t, y) => t + q(y, d.getUTCMonth()), 0) / years.length) : 0;
    };
    const driver = isGrowthDriver(ps[0].model, ps[0].category);
    const g = (driver ? s.driverGrowthPct : s.otherGrowthPct) / 100;
    const month = (d: Date, fraction = 1): ForecastMonth => {
      const b = base(d);
      const growth = d.getUTCFullYear() > y0;
      return {
        key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
        label: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}${fraction < 1 ? " (rest)" : ""}`,
        base: r1(b * fraction),
        growth,
        fraction,
        qty: r1(b * fraction * (growth ? 1 + g : 1)),
      };
    };
    const before = beforeMonths.map((d, i) => month(d, i === 0 ? restOfMonth : 1));
    const after = afterMonths.map((d) => month(d));
    const st = ps.reduce((t, p) => t + (stock.get(p.id) ?? 0), 0);
    const tr = ps.reduce((t, p) => t + (transit.get(p.id)?.qty ?? 0), 0);
    const etas = ps.map((p) => transit.get(p.id)?.eta).filter((d): d is Date => !!d);
    const paid = paidBy.get(k) ?? 0;
    const soldBefore = r1(before.reduce((t, x) => t + x.qty, 0));
    const stockAtArrival = r1(st + tr - paid - soldBefore);
    const needAfter = r1(after.reduce((t, x) => t + x.qty, 0));
    out.push({
      key: k,
      model: modelCodeOf(ps[0].model),
      category: ps[0].category,
      codes: ps.map((p) => p.code),
      driver,
      stock: st,
      transit: tr,
      eta: etas.length ? new Date(Math.min(...etas.map((d) => d.getTime()))) : null,
      paid,
      unpaid: unpaidBy.get(k) ?? 0,
      before,
      after,
      soldBefore,
      stockAtArrival,
      needAfter,
      order: Math.max(0, Math.ceil(needAfter - Math.max(0, stockAtArrival) - 1e-9)),
      shortBefore: Math.max(0, Math.ceil(-stockAtArrival - 1e-9)),
      history: Array.from({ length: s.yearsBack + 1 }, (_, i) => y0 - i).map((year) => {
        const months = Array.from({ length: 12 }, (_, mo) => q(year, mo));
        return { year, months, total: months.reduce((t, n) => t + n, 0) };
      }),
    });
  }
  return out;
}
