import { prisma } from "@/lib/prisma";
import { computeDealDiscount } from "@/lib/discount";
import { getLatestPriceByProduct } from "@/lib/pricing";
import { pushToRole, sendPush } from "@/lib/push";

// Pushes sent when something needs someone's action. All best-effort.

// A deal's products now need the Head's discount approval.
export async function notifyDiscountIfNeeded(dealId: string) {
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { title: true, stage: true, discountApprovedAt: true, owner: { select: { name: true } }, items: { select: { qty: true, unitPrice: true, productId: true } } },
    });
    if (!deal || deal.stage === "WON" || deal.stage === "LOST" || deal.discountApprovedAt || deal.items.length === 0) return;
    const disc = computeDealDiscount(deal.items, await getLatestPriceByProduct(), null);
    if (!disc?.needsApproval) return;
    await pushToRole("HEAD", {
      title: "Discount approval needed",
      body: `${deal.title} - ${disc.discountPct.toFixed(1)}% below list (${deal.owner.name})`,
      url: `/deals/${dealId}`,
      tag: `discount-${dealId}`,
    });
  } catch (e) {
    console.error("notifyDiscountIfNeeded", e);
  }
}

export async function notifyDiscountApproved(dealId: string) {
  try {
    const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { title: true, ownerId: true } });
    if (deal) await sendPush([deal.ownerId], { title: "Discount approved", body: `${deal.title} can now be marked Won.`, url: `/deals/${dealId}`, tag: `discount-${dealId}` });
  } catch (e) {
    console.error("notifyDiscountApproved", e);
  }
}

const monthName = (m: Date) => m.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const incentivesUrl = (m: Date) => `/incentives?month=${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`;

export async function notifyIncentives(kind: "submitted" | "approved" | "returned", month: Date, by: string, toUserId?: string, note?: string) {
  const url = incentivesUrl(month);
  if (kind === "submitted") {
    await pushToRole("HEAD", { title: "Incentives waiting for approval", body: `${monthName(month)} incentives submitted by ${by}.`, url, tag: `incentives-${url}` });
  } else {
    const payload = {
      title: kind === "approved" ? "Incentives approved" : "Incentives returned",
      body: kind === "approved" ? `${monthName(month)} incentives approved by ${by} - the statement is ready for finance.` : `${monthName(month)} incentives sent back by ${by}${note ? `: ${note}` : "."}`,
      url,
      tag: `incentives-${url}`,
    };
    if (toUserId) await sendPush([toUserId], payload);
    else await pushToRole("COORDINATOR", payload);
  }
}

// A quotation's discount went over an item's maximum: the Head decides.
export async function notifyQuoteDiscountRequested(quoteId: string) {
  try {
    const q = await prisma.quotation.findUnique({ where: { id: quoteId }, select: { ref: true, customerName: true, owner: { select: { name: true } } } });
    if (!q) return;
    await pushToRole("HEAD", {
      title: "Quote below permissible discount",
      body: `${q.ref} - ${q.customerName} (${q.owner.name})`,
      url: "/quotations/approvals",
      tag: `quote-discount-${quoteId}`,
    });
  } catch (e) {
    console.error("notifyQuoteDiscountRequested", e);
  }
}

// The Head approved / rejected it: tell the sales person and whoever made it.
export async function notifyQuoteDiscountDecided(quoteId: string, approved: boolean) {
  try {
    const q = await prisma.quotation.findUnique({ where: { id: quoteId }, select: { ref: true, customerName: true, ownerId: true, createdById: true } });
    if (!q) return;
    await sendPush([...new Set([q.ownerId, q.createdById])], {
      title: approved ? "Quotation approved by the Head" : "Quotation declined by the Head",
      body: approved ? `${q.ref} - ${q.customerName}: download it from Saved quotations.` : `${q.ref} - ${q.customerName}: bring the discount within the limit.`,
      url: approved ? "/quotations/saved" : `/quotations?quote=${quoteId}`,
      tag: `quote-discount-${quoteId}`,
    });
  } catch (e) {
    console.error("notifyQuoteDiscountDecided", e);
  }
}
