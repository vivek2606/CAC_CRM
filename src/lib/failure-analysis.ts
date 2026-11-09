import { prisma } from "@/lib/prisma";

// Failure rates: for units sold in a period (by invoice date), the
// complaints on them - per model as a share of units sold (all, and within
// the first year), how soon they failed, what failed (nature) and the spares
// replaced; and per spare part across models. Installation and routine
// servicing requests aren't failures.

const NOT_FAILURES = ["Installation / re-installation", "Servicing / PPM"];
const DAY = 86400000;
const key = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

export type ModelFailure = {
  model: string;
  category: string | null;
  unitsSold: number;
  failures: number;
  firstYear: number;
  inWarranty: number;
  ratePct: number | null;
  firstYearRatePct: number | null;
  avgDaysToFailure: number | null;
  natures: { nature: string; count: number }[];
  parts: { name: string; qty: number }[];
  partsCost: number;
};
// Failure rate by quarter of sale, per model: a bad production batch shows
// as one quarter's units failing more than the others.
export type CohortCell = { quarter: string; unitsSold: number; failures: number; ratePct: number | null };
export type ModelCohorts = { model: string; cells: CohortCell[] };
const quarterOf = (d: Date) => `${d.getUTCFullYear()} Q${Math.floor(d.getUTCMonth() / 3) + 1}`;

export type PartFailure = { name: string; qty: number; complaints: number; models: { model: string; qty: number }[]; cost: number; inWarrantyQty: number };

export async function failureAnalysis(from: Date, to: Date) {
  const end = new Date(to.getTime() + DAY);
  const [units, complaints] = await Promise.all([
    prisma.installedUnit.findMany({ where: { invoiceDate: { gte: from, lt: end } }, select: { model: true, qty: true, category: true, invoiceDate: true, product: { select: { model: true } } } }),
    prisma.serviceComplaint.findMany({
      where: { invoiceDate: { gte: from, lt: end }, status: { not: "CANCELLED" }, nature: { notIn: NOT_FAILURES } },
      select: {
        model: true,
        invoiceDate: true,
        registeredAt: true,
        inWarranty: true,
        nature: true,
        product: { select: { model: true } },
        parts: { where: { kind: "SPARE" }, select: { name: true, qty: true, unitCost: true, chargeable: true } },
      },
    }),
  ]);

  const models = new Map<string, ModelFailure & { days: number[]; natureMap: Map<string, number>; partMap: Map<string, number> }>();
  const get = (name: string, category: string | null) => {
    const k = key(name);
    let m = models.get(k);
    if (!m) {
      m = { model: name.trim(), category, unitsSold: 0, failures: 0, firstYear: 0, inWarranty: 0, ratePct: null, firstYearRatePct: null, avgDaysToFailure: null, natures: [], parts: [], partsCost: 0, days: [], natureMap: new Map(), partMap: new Map() };
      models.set(k, m);
    }
    if (!m.category && category) m.category = category;
    return m;
  };
  for (const u of units) get(u.product?.model ?? u.model, u.category).unitsSold += u.qty;

  const parts = new Map<string, PartFailure & { modelMap: Map<string, number> }>();
  for (const c of complaints) {
    const name = c.product?.model ?? c.model;
    if (!name) continue;
    const m = get(name, null);
    m.failures++;
    if (c.inWarranty) m.inWarranty++;
    const days = c.invoiceDate ? Math.max(0, Math.round((c.registeredAt.getTime() - c.invoiceDate.getTime()) / DAY)) : null;
    if (days != null) {
      m.days.push(days);
      if (days <= 365) m.firstYear++;
    }
    m.natureMap.set(c.nature, (m.natureMap.get(c.nature) ?? 0) + 1);
    const seen = new Set<string>();
    for (const p of c.parts) {
      const pk = key(p.name);
      m.partMap.set(p.name.trim(), (m.partMap.get(p.name.trim()) ?? 0) + p.qty);
      m.partsCost += p.qty * p.unitCost;
      let pf = parts.get(pk);
      if (!pf) {
        pf = { name: p.name.trim(), qty: 0, complaints: 0, models: [], cost: 0, inWarrantyQty: 0, modelMap: new Map() };
        parts.set(pk, pf);
      }
      pf.qty += p.qty;
      pf.cost += p.qty * p.unitCost;
      if (!p.chargeable) pf.inWarrantyQty += p.qty;
      if (!seen.has(pk)) pf.complaints++;
      seen.add(pk);
      pf.modelMap.set(m.model, (pf.modelMap.get(m.model) ?? 0) + p.qty);
    }
  }

  const byModel: ModelFailure[] = [...models.values()]
    .map(({ days, natureMap, partMap, ...m }) => ({
      ...m,
      ratePct: m.unitsSold ? (m.failures / m.unitsSold) * 100 : null,
      firstYearRatePct: m.unitsSold ? (m.firstYear / m.unitsSold) * 100 : null,
      avgDaysToFailure: days.length ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : null,
      natures: [...natureMap.entries()].map(([nature, count]) => ({ nature, count })).sort((a, b) => b.count - a.count),
      parts: [...partMap.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty),
      partsCost: Math.round(m.partsCost * 100) / 100,
    }))
    .filter((m) => m.unitsSold > 0 || m.failures > 0)
    .sort((a, b) => (b.ratePct ?? -1) - (a.ratePct ?? -1) || b.failures - a.failures);
  // Cohorts: units sold and complaints by model and quarter of sale.
  const cohort = new Map<string, Map<string, { unitsSold: number; failures: number }>>();
  const bump = (name: string, d: Date | null, k: "unitsSold" | "failures", n: number) => {
    if (!d) return;
    const m = cohort.get(key(name)) ?? new Map();
    const q = quarterOf(d);
    const c = m.get(q) ?? { unitsSold: 0, failures: 0 };
    c[k] += n;
    m.set(q, c);
    cohort.set(key(name), m);
  };
  for (const u of units) bump(u.product?.model ?? u.model, u.invoiceDate, "unitsSold", u.qty);
  for (const c of complaints) if (c.product?.model ?? c.model) bump((c.product?.model ?? c.model)!, c.invoiceDate, "failures", 1);
  const quarters: string[] = [];
  for (let d = new Date(Date.UTC(from.getUTCFullYear(), Math.floor(from.getUTCMonth() / 3) * 3, 1)); d < end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1))) quarters.push(quarterOf(d));

  const byPart: PartFailure[] = [...parts.values()]
    .map(({ modelMap, ...p }) => ({ ...p, cost: Math.round(p.cost * 100) / 100, models: [...modelMap.entries()].map(([model, qty]) => ({ model, qty })).sort((a, b) => b.qty - a.qty) }))
    .sort((a, b) => b.qty - a.qty);
  const unitsSold = byModel.reduce((s, m) => s + m.unitsSold, 0);
  const failures = byModel.reduce((s, m) => s + m.failures, 0);
  // The models sold most, by quarter of sale.
  const cohorts: ModelCohorts[] = [...byModel]
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .filter((m) => m.unitsSold > 0)
    .map((m) => ({
      model: m.model,
      cells: quarters.map((q) => {
        const c = cohort.get(key(m.model))?.get(q) ?? { unitsSold: 0, failures: 0 };
        return { quarter: q, ...c, ratePct: c.unitsSold ? (c.failures / c.unitsSold) * 100 : null };
      }),
    }));
  return {
    byModel,
    byPart,
    quarters,
    cohorts,
    totals: {
      unitsSold,
      failures,
      firstYear: byModel.reduce((s, m) => s + m.firstYear, 0),
      ratePct: unitsSold ? (failures / unitsSold) * 100 : null,
      partsCost: Math.round(byModel.reduce((s, m) => s + m.partsCost, 0) * 100) / 100,
    },
  };
}
