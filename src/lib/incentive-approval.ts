import { prisma } from "@/lib/prisma";
import type { IncentiveSettings, SalesIncentive, SupportShare } from "@/lib/incentive";

// Monthly incentive sign-off: the Sales Coordinator prepares and submits a
// month, the Head approves it (or sends it back with a note), and only an
// approved month can be downloaded as the PDF statement for finance. The
// approved figures are frozen in a snapshot, so the PDF always shows what
// was approved even if sales data changes later. Stored per month in
// AppSetting "incentive-approval:YYYY-MM" (no schema change).

export type IncentiveSnapshot = {
  rows: Pick<
    SalesIncentive,
    "userId" | "name" | "target" | "productSales" | "projectSales" | "sales" | "achievement" | "rate" | "incentive" | "payout" | "toPool" | "salarySupportPct" | "salarySupport" | "totalToReceive"
  >[];
  support: SupportShare[];
  scheme: {
    tiers: IncentiveSettings["tiers"];
    salesPersonSharePct: number;
    coordinatorFirstShare: number;
  };
};

type Person = { id: string; name: string };

export type IncentiveApproval = {
  status: "SUBMITTED" | "APPROVED" | "RETURNED";
  submittedAt?: string;
  submittedBy?: Person;
  approvedAt?: string;
  approvedBy?: Person;
  returnedAt?: string;
  returnedBy?: Person;
  note?: string;
  snapshot?: IncentiveSnapshot; // set on approval
};

export const monthKey = (month: Date) => `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
const settingKey = (month: Date) => `incentive-approval:${monthKey(month)}`;

export async function getIncentiveApproval(month: Date): Promise<IncentiveApproval | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: settingKey(month) } });
    return (row?.value as IncentiveApproval | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveIncentiveApproval(month: Date, approval: IncentiveApproval) {
  const value = JSON.parse(JSON.stringify(approval));
  await prisma.appSetting.upsert({ where: { key: settingKey(month) }, create: { key: settingKey(month), value }, update: { value } });
}

export function snapshotOf(rows: SalesIncentive[], support: SupportShare[], settings: IncentiveSettings): IncentiveSnapshot {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    rows: rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      target: r.target,
      productSales: r.productSales,
      projectSales: r.projectSales,
      sales: r.sales,
      achievement: r.achievement,
      rate: r.rate,
      incentive: r2(r.incentive),
      payout: r2(r.payout),
      toPool: r2(r.toPool),
      salarySupportPct: r.salarySupportPct,
      salarySupport: r2(r.salarySupport),
      totalToReceive: r2(r.totalToReceive),
    })),
    support: support.map((s) => ({ ...s, amount: r2(s.amount) })),
    scheme: { tiers: settings.tiers, salesPersonSharePct: settings.salesPersonSharePct, coordinatorFirstShare: settings.coordinatorFirstShare },
  };
}

// Total payable (sales team + support staff) - used to notice when live
// figures no longer match what was approved.
export function totalPayable(s: Pick<IncentiveSnapshot, "rows" | "support">): number {
  return Math.round((s.rows.reduce((t, r) => t + r.totalToReceive, 0) + s.support.reduce((t, x) => t + x.amount, 0)) * 100) / 100;
}
