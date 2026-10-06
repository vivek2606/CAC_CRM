// Monthly sales incentive scheme.
//
//   Achievement = month's Won sales / month's target.
//   >= 100%       -> 0.5% of the month's sales
//   >= 90% < 100% -> 0.4%
//   < 90% (or no target) -> not eligible
//
// An eligible sales person keeps 80% of their incentive; 20% goes into a
// pool shared with the support staff: the Sales Coordinator takes the first
// N50,000 and the balance is split equally among the rest.

export const INCENTIVE_TIERS = [
  { minAchievement: 1.0, rate: 0.005 },
  { minAchievement: 0.9, rate: 0.004 },
] as const;
export const SALES_PERSON_SHARE = 0.8;
export const SUPPORT_POOL_SHARE = 0.2;
export const COORDINATOR_FIRST_SHARE = 50_000;

export const SUPPORT_STAFF = [
  { name: "Joy Sale", role: "Sales Coordinator", coordinator: true },
  { name: "Ogunremi Seye", role: "Design Support", coordinator: false },
  { name: "Stephen Ani", role: "Design Support", coordinator: false },
  { name: "Okunade Sikiru", role: "Service Support", coordinator: false },
] as const;

export type SalesIncentive = {
  userId: string;
  name: string;
  target: number;
  sales: number;
  achievement: number | null; // fraction, e.g. 0.95; null when no target
  rate: number; // 0 when not eligible
  incentive: number; // sales x rate
  payout: number; // 80% kept by the sales person
  toPool: number; // 20% shared with support staff
};

export type SupportShare = { name: string; role: string; amount: number };

export function rateFor(achievement: number | null): number {
  if (achievement == null) return 0;
  // Tiny tolerance so floating-point noise (e.g. 89.99999999%) doesn't
  // drop an exact 90% / 100% achievement into the tier below.
  return INCENTIVE_TIERS.find((t) => achievement + 1e-9 >= t.minAchievement)?.rate ?? 0;
}

export function calculateSalesIncentive(p: { userId: string; name: string; target: number; sales: number }): SalesIncentive {
  const achievement = p.target > 0 ? p.sales / p.target : null;
  const rate = rateFor(achievement);
  const incentive = Math.max(0, p.sales) * rate;
  return {
    ...p,
    achievement,
    rate,
    incentive,
    payout: incentive * SALES_PERSON_SHARE,
    toPool: incentive * SUPPORT_POOL_SHARE,
  };
}

// The coordinator takes up to N50,000 first; whatever is left is divided
// equally among the other support staff. A pool under N50,000 goes wholly
// to the coordinator.
export function distributeSupportPool(pool: number): SupportShare[] {
  const coordinatorAmount = Math.min(pool, COORDINATOR_FIRST_SHARE);
  const others = SUPPORT_STAFF.filter((s) => !s.coordinator);
  const each = others.length > 0 ? (pool - coordinatorAmount) / others.length : 0;
  return SUPPORT_STAFF.map((s) => ({ name: s.name, role: s.role, amount: s.coordinator ? coordinatorAmount : each }));
}
