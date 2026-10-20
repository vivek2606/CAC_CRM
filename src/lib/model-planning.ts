import { prisma } from "@/lib/prisma";
import { getAvailableStockByProduct, getInTransitByProduct } from "@/lib/pricing";
import { modelKey, modelCodeOf } from "@/lib/model-family";

// Ordering from Midea, model by model (every code of a model together, its
// type kept apart - see model-family.ts): units sold month by month this
// year and last, the 3-month average, stock, goods in transit and pending
// orders, and the quantity to order to keep `coverMonths` of sales in stock
// - the reorder rule: cover x average + paid pending - stock - in transit.

export type ModelPlan = {
  key: string;
  model: string;
  category: string;
  codes: string[];
  years: { year: number; months: number[]; total: number }[]; // this year, last year
  avg3: number; // units a month, last three complete months
  stock: number;
  transit: number;
  eta: Date | null;
  paid: number; // open pending orders, payment received
  unpaid: number;
  monthsCover: number | null; // stock left after paid orders, in months of avg3
  suggested: number;
};

export type PlanningWindow = { thisYear: number; last3: Date[]; avgLabel: string };

export function planningWindow(now = new Date()): PlanningWindow {
  const thisYear = now.getUTCFullYear();
  const last3 = [3, 2, 1].map((back) => new Date(Date.UTC(thisYear, now.getUTCMonth() - back, 1)));
  const f = (d: Date, year: boolean) => d.toLocaleDateString("en-GB", { month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  return { thisYear, last3, avgLabel: `${f(last3[0], false)}-${f(last3[2], true)}` };
}

export async function getModelPlans(coverMonths: number, onlyKey?: string): Promise<{ window: PlanningWindow; plans: ModelPlan[] }> {
  const window = planningWindow();
  const { thisYear, last3 } = window;
  const from = new Date(Math.min(Date.UTC(thisYear - 1, 0, 1), last3[0].getTime()));
  const [products, sums, stock, transit, pending] = await Promise.all([
    prisma.product.findMany({ select: { id: true, code: true, model: true, category: true } }),
    prisma.saleLineItem.groupBy({ by: ["productId", "month"], where: { month: { gte: from, lt: new Date(Date.UTC(thisYear + 1, 0, 1)) } }, _sum: { qty: true } }),
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

  const blank = () => ({ months: new Map<string, number>(), paid: 0, unpaid: 0 });
  const acc = new Map<string, ReturnType<typeof blank>>();
  const at = (k: string) => acc.get(k) ?? (acc.set(k, blank()), acc.get(k)!);
  for (const s of sums) {
    const k = keyOf.get(s.productId);
    if (!k) continue;
    const m = at(k).months;
    const ym = s.month.toISOString().slice(0, 7);
    m.set(ym, (m.get(ym) ?? 0) + (s._sum.qty ?? 0));
  }
  for (const p of pending) {
    const k = keyOf.get(p.productId);
    if (!k) continue;
    if (p.paymentReceived) at(k).paid += p._sum.quantity ?? 0;
    else at(k).unpaid += p._sum.quantity ?? 0;
  }

  const plans: ModelPlan[] = [];
  for (const [k, ps] of groups) {
    const a = acc.get(k) ?? blank();
    const sold = (y: number, m: number) => a.months.get(`${y}-${String(m + 1).padStart(2, "0")}`) ?? 0;
    const years = [thisYear, thisYear - 1].map((year) => {
      const months = Array.from({ length: 12 }, (_, m) => sold(year, m));
      return { year, months, total: months.reduce((t, n) => t + n, 0) };
    });
    const avg3 = Math.max(0, last3.reduce((t, d) => t + sold(d.getUTCFullYear(), d.getUTCMonth()), 0) / 3);
    const st = ps.reduce((t, p) => t + (stock.get(p.id) ?? 0), 0);
    const tr = ps.reduce((t, p) => t + (transit.get(p.id)?.qty ?? 0), 0);
    const etas = ps.map((p) => transit.get(p.id)?.eta).filter((d): d is Date => !!d);
    plans.push({
      key: k,
      model: modelCodeOf(ps[0].model),
      category: ps[0].category,
      codes: ps.map((p) => p.code),
      years,
      avg3: Math.round(avg3 * 10) / 10,
      stock: st,
      transit: tr,
      eta: etas.length ? new Date(Math.min(...etas.map((d) => d.getTime()))) : null,
      paid: a.paid,
      unpaid: a.unpaid,
      monthsCover: avg3 > 0 ? Math.max(0, st - a.paid) / avg3 : null,
      suggested: Math.max(0, Math.ceil(avg3 * coverMonths + a.paid - st - tr)),
    });
  }
  return { window, plans };
}
