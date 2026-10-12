import { prisma } from "@/lib/prisma";

// Invoices from a products sheet uploaded on the deal form that couldn't be
// applied when it was saved (e.g. a discount still awaiting approval). Kept
// so Mark Won opens with them filled in instead of asking for them again;
// cleared once the deal is marked Won.
export type WonPlanInvoice = {
  invoiceNo: string;
  closedAt: string;
  billingCompany?: string;
  items: { productId: string; qty: number; unitPrice: number }[];
};
export type WonPlan = { invoices: WonPlanInvoice[]; error: string };

const keyFor = (dealId: string) => `won-plan:${dealId}`;

export async function getWonPlan(dealId: string): Promise<WonPlan | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: keyFor(dealId) } });
  const v = row?.value as WonPlan | undefined;
  return v && Array.isArray(v.invoices) && v.invoices.length ? v : null;
}

export async function saveWonPlan(dealId: string, plan: WonPlan): Promise<void> {
  const value = plan as unknown as object;
  await prisma.appSetting.upsert({ where: { key: keyFor(dealId) }, create: { key: keyFor(dealId), value }, update: { value } });
}

export async function clearWonPlan(dealId: string): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key: keyFor(dealId) } });
}
