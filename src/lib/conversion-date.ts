import { prisma } from "@/lib/prisma";

// A deal's own date (createdAt) is when it was converted from its lead (or
// entered). When a deal is marked won / lost with a closing (invoice) date
// BEFORE that - a lead left unconverted while the sale was billed in the
// ERP - its conversion date is set to this many days before the closing
// date. A deal closed normally (on or after its conversion day) keeps its
// dates. Deals from the Sales Register import are left alone.
export const DAYS_BEFORE_CLOSE = 3;

const DAY = 86400000;
const dayOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

// One closed deal: converted on a later day than it closed -> 3 days before
// the closing date (and its lead's date, if later still).
export async function keepConversionBeforeClose(dealId: string): Promise<void> {
  const d = await prisma.deal.findUnique({ where: { id: dealId }, select: { createdAt: true, closedAt: true, sourceTxnNo: true } });
  if (!d?.closedAt || d.sourceTxnNo != null) return;
  if (dayOf(d.createdAt) <= dayOf(d.closedAt)) return;
  const convertedOn = new Date(dayOf(d.closedAt) - DAYS_BEFORE_CLOSE * DAY);
  await prisma.deal.update({ where: { id: dealId }, data: { createdAt: convertedOn } });
  await prisma.lead.updateMany({ where: { convertedDealId: dealId, createdAt: { gt: convertedOn } }, data: { createdAt: convertedOn } });
}

// All closed CRM deals converted on a later day than they closed - set to 3
// days before closing (and their leads). Returns how many deals moved.
export async function fixLateConversions(): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.$executeRaw`
      UPDATE "Deal" SET "createdAt" = date_trunc('day', "closedAt") - make_interval(days => ${DAYS_BEFORE_CLOSE}::int)
      WHERE "closedAt" IS NOT NULL AND "sourceTxnNo" IS NULL
        AND date_trunc('day', "createdAt") > date_trunc('day', "closedAt")`;
    await tx.$executeRaw`
      UPDATE "Lead" l SET "createdAt" = d."createdAt"
      FROM "Deal" d
      WHERE l."convertedDealId" = d.id AND d."sourceTxnNo" IS NULL AND l."createdAt" > d."createdAt"`;
    return moved;
  });
}
