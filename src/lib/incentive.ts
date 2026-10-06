import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Monthly sales incentive scheme. Every number and the support staff list
// are editable by the Head (Incentives -> Scheme settings) and stored in
// AppSetting "incentive"; DEFAULT_INCENTIVE_SETTINGS applies until then.
//
//   Achievement = month's Won sales / month's target.
//   Highest tier whose threshold is met sets the rate (e.g. >= 100% -> 0.5%,
//   >= 90% -> 0.4%); below every threshold, or no target -> not eligible.
//   An eligible sales person keeps salesPersonSharePct of the incentive; the
//   rest goes into a support staff pool. The coordinator takes up to
//   coordinatorFirstShare first and the balance is split equally among the
//   other support staff.
//   Salary support: named sales people also get a % of their (gross)
//   incentive on top, paid by the company - not out of the support pool.

export const incentiveSettingsSchema = z.object({
  // First month the scheme applies ("YYYY-MM"); earlier months show nothing.
  startMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Pick the month incentives start from.")
    .default("2026-08"),
  tiers: z
    .array(
      z.object({
        minAchievementPct: z.number().min(0).max(1000),
        ratePct: z.number().min(0).max(100),
      }),
    )
    .min(1, "Add at least one rate tier."),
  salesPersonSharePct: z.number().min(0).max(100),
  coordinatorFirstShare: z.number().min(0),
  supportStaff: z.array(
    z.object({
      name: z.string().trim().min(1, "Every support staff member needs a name."),
      role: z.string().trim(),
      coordinator: z.boolean(),
      // Optional login: that user then sees their own share on the
      // Incentives page.
      userId: z.string().nullable(),
    }),
  ),
  // Extra paid on top of the sales person's share, as a % of their gross
  // incentive (e.g. 100% = the full incentive again). Matched by login,
  // or by name until a login is picked.
  salarySupport: z
    .array(
      z.object({
        name: z.string().trim(),
        userId: z.string().nullable(),
        pct: z.number().min(0).max(1000),
      }),
    )
    .default([]),
});
export type IncentiveSettings = z.infer<typeof incentiveSettingsSchema>;

export const DEFAULT_INCENTIVE_SETTINGS: IncentiveSettings = {
  startMonth: "2026-08",
  tiers: [
    { minAchievementPct: 100, ratePct: 0.5 },
    { minAchievementPct: 90, ratePct: 0.4 },
  ],
  salesPersonSharePct: 80,
  coordinatorFirstShare: 50_000,
  supportStaff: [
    { name: "Joy Sale", role: "Sales Coordinator", coordinator: true, userId: null },
    { name: "Ogunremi Seye", role: "Design Support", coordinator: false, userId: null },
    { name: "Stephen Ani", role: "Design Support", coordinator: false, userId: null },
    { name: "Okunade Sikiru", role: "Service Support", coordinator: false, userId: null },
  ],
  salarySupport: [{ name: "Chris Mokobia", userId: null, pct: 100 }],
};

const SETTINGS_KEY = "incentive";

export async function getIncentiveSettings(): Promise<IncentiveSettings> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    const parsed = row ? incentiveSettingsSchema.safeParse(row.value) : null;
    return parsed?.success ? parsed.data : DEFAULT_INCENTIVE_SETTINGS;
  } catch {
    // Settings table not created yet - the defaults still work.
    return DEFAULT_INCENTIVE_SETTINGS;
  }
}

export async function saveIncentiveSettings(settings: IncentiveSettings) {
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: settings },
    update: { value: settings },
  });
}

export type SalesIncentive = {
  userId: string;
  name: string;
  target: number;
  sales: number; // product sales + project billing
  productSales: number;
  projectSales: number;
  achievement: number | null; // fraction, e.g. 0.95; null when no target
  rate: number; // fraction, 0 when not eligible
  incentive: number; // sales x rate
  payout: number; // the sales person's share
  toPool: number; // shared with support staff
  salarySupportPct: number; // 0 when none
  salarySupport: number; // extra on top, from the company
  totalToReceive: number; // payout + salarySupport
};

export type SupportShare = { name: string; role: string; coordinator: boolean; userId: string | null; amount: number };

export function rateFor(achievement: number | null, settings: IncentiveSettings): number {
  if (achievement == null) return 0;
  const tiers = [...settings.tiers].sort((a, b) => b.minAchievementPct - a.minAchievementPct);
  // Tiny tolerance so floating-point noise (e.g. 89.99999999%) doesn't drop
  // an exact threshold into the tier below.
  const tier = tiers.find((t) => achievement * 100 + 1e-7 >= t.minAchievementPct);
  return tier ? tier.ratePct / 100 : 0;
}

// Sales for incentive = Won product sales + Project & Service billing.
export function calculateSalesIncentive(
  input: { userId: string; name: string; target: number; productSales: number; projectSales?: number },
  settings: IncentiveSettings,
): SalesIncentive {
  const projectSales = input.projectSales ?? 0;
  const p = { ...input, projectSales, sales: input.productSales + projectSales };
  const achievement = p.target > 0 ? p.sales / p.target : null;
  const rate = rateFor(achievement, settings);
  const incentive = Math.max(0, p.sales) * rate;
  const share = settings.salesPersonSharePct / 100;
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const support = settings.salarySupport.find((s) => (s.userId ? s.userId === p.userId : norm(s.name) === norm(p.name)));
  const salarySupportPct = support?.pct ?? 0;
  const payout = incentive * share;
  const salarySupport = incentive * (salarySupportPct / 100);
  return {
    ...p,
    achievement,
    rate,
    incentive,
    payout,
    toPool: incentive - payout,
    salarySupportPct,
    salarySupport,
    totalToReceive: payout + salarySupport,
  };
}

// The coordinator takes up to coordinatorFirstShare first; the rest is split
// equally among the other support staff (or among everyone, when no
// coordinator is set). A pool under the first share goes wholly to the
// coordinator.
export function distributeSupportPool(pool: number, settings: IncentiveSettings): SupportShare[] {
  const staff = settings.supportStaff;
  const coordinatorIdx = staff.findIndex((s) => s.coordinator);
  const coordinatorAmount = coordinatorIdx === -1 ? 0 : Math.min(pool, settings.coordinatorFirstShare);
  const sharers = staff.filter((_, i) => i !== coordinatorIdx);
  const each = sharers.length > 0 ? (pool - coordinatorAmount) / sharers.length : 0;
  return staff.map((s, i) => ({
    name: s.name,
    role: s.role,
    coordinator: i === coordinatorIdx,
    userId: s.userId,
    amount: i === coordinatorIdx ? coordinatorAmount + (sharers.length === 0 ? pool - coordinatorAmount : 0) : each,
  }));
}
