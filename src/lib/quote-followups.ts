import { prisma } from "@/lib/prisma";
import { NOT_DRAFT } from "@/lib/quote-draft";
import { documentInputSchema } from "@/lib/sales-document";
import { getPriceHistory, priceChangesIn, productIdByModel, quoteProductLines, type PriceChange } from "@/lib/pricing";

// Follow-up reminders on open quotations: a quotation (or proforma) sent
// and not converted comes due 7 days after it went out - or after its last
// follow-up, or on the next follow-up date set then. Amber from 7 days old,
// red from 14. It stays until the deal is won / lost or the quote is marked
// lost. A completed activity logged on its deal counts as a follow-up. One per deal
// (its latest quotation).

export const FOLLOW_UP_DAYS = 7;
export const FOLLOW_UP_RED_DAYS = 14;
// Quotes older than this have gone cold - not chased any more.
const LOOK_BACK_DAYS = 120;
const day = 86400000;

export type QuoteFollowUp = {
  id: string;
  ref: string;
  type: string;
  customerName: string;
  total: number;
  dealId: string | null;
  dealTitle: string | null;
  ownerId: string;
  ownerName: string;
  sentOn: Date;
  ageDays: number;
  dueOn: Date;
  lastFollowUpOn: Date | null;
  level: "amber" | "red";
  priceChanges: PriceChange[];
};

// prices: false skips the price check (just the count).
export async function getQuoteFollowUps(ownerIds: string[] | null, { now = new Date(), prices = true } = {}): Promise<QuoteFollowUp[]> {
  const quotes = await prisma.quotation.findMany({
    where: {
      ...NOT_DRAFT,
      type: { in: ["quote", "proforma"] },
      outcome: null,
      ...(ownerIds ? { ownerId: { in: ownerIds } } : {}),
      createdAt: { gte: new Date(now.getTime() - LOOK_BACK_DAYS * day) },
      OR: [{ dealId: null }, { deal: { stage: { notIn: ["WON", "LOST"] } } }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ref: true,
      type: true,
      customerName: true,
      total: true,
      data: true,
      createdAt: true,
      sentAt: true,
      lastFollowUpAt: true,
      nextFollowUpAt: true,
      ownerId: true,
      owner: { select: { name: true } },
      dealId: true,
      deal: { select: { title: true, activities: { where: { status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } } },
    },
    take: 1000,
  });

  const seenDeals = new Set<string>();
  const due: Omit<QuoteFollowUp, "priceChanges">[] = [];
  const data: unknown[] = [];
  for (const q of quotes) {
    if (q.dealId) {
      if (seenDeals.has(q.dealId)) continue;
      seenDeals.add(q.dealId);
    }
    const sentOn = q.sentAt ?? q.createdAt;
    const touched = [q.lastFollowUpAt, q.deal?.activities[0]?.createdAt].filter((d): d is Date => !!d && d > sentOn);
    const last = touched.length ? new Date(Math.max(...touched.map((d) => d.getTime()))) : null;
    const base = last ?? sentOn;
    const dueOn = q.nextFollowUpAt && q.nextFollowUpAt > base ? q.nextFollowUpAt : new Date(base.getTime() + FOLLOW_UP_DAYS * day);
    if (dueOn > now) continue;
    const ageDays = Math.floor((now.getTime() - sentOn.getTime()) / day);
    due.push({
      id: q.id,
      ref: q.ref,
      type: q.type,
      customerName: q.customerName,
      total: q.total,
      dealId: q.dealId,
      dealTitle: q.deal?.title ?? null,
      ownerId: q.ownerId,
      ownerName: q.owner.name,
      sentOn,
      ageDays,
      dueOn,
      lastFollowUpOn: last,
      level: ageDays >= FOLLOW_UP_RED_DAYS ? "red" : "amber",
    });
    data.push(q.data);
  }

  // Prices changed since each quote went out - old rates shouldn't be re-sent.
  const idByModel = due.length && prices ? await productIdByModel() : new Map<string, string>();
  const lines = data.map((d) => {
    const parsed = documentInputSchema.safeParse(d);
    return parsed.success && prices ? quoteProductLines(parsed.data.rows, idByModel) : [];
  });
  const ids = [...new Set(lines.flat().map((l) => l.productId))];
  const history = ids.length ? await getPriceHistory(ids) : new Map();
  return due
    .map((q, i) => ({ ...q, priceChanges: priceChangesIn(history, lines[i], q.sentOn, now) }))
    .sort((a, b) => b.ageDays - a.ageDays);
}

// For the browser (dates as ISO strings).
export function followUpItems(list: QuoteFollowUp[]) {
  return list.map((q) => ({
    id: q.id,
    ref: q.ref,
    customerName: q.customerName,
    total: q.total,
    dealId: q.dealId,
    dealTitle: q.dealTitle,
    ownerName: q.ownerName,
    sentOn: q.sentOn.toISOString(),
    ageDays: q.ageDays,
    lastFollowUpOn: q.lastFollowUpOn?.toISOString() ?? null,
    level: q.level,
    priceChanges: q.priceChanges.map((c) => ({ description: c.description, from: c.from, to: c.to, on: c.on.toISOString(), upcoming: c.upcoming })),
  }));
}
