import { DISCOUNT_APPROVAL_THRESHOLD_PCT } from "@/lib/constants";

export type DiscountInfo = {
  itemizedTotal: number;
  referenceTotal: number;
  discountAmount: number;
  discountPct: number; // 0-100, floored at 0 (never negative - selling above list isn't a "discount")
  needsApproval: boolean;
};

// Compares a deal's actual itemized total against what the same line items
// would cost at current catalog price. Returns null when there's nothing to
// compare (no line items, or none of the products have a catalog price yet)
// - those deals fall outside the approval gate entirely, since there's no
// reference point to call anything a "discount" against.
export function computeDealDiscount(
  items: { qty: number; unitPrice: number; productId: string }[],
  referencePriceByProduct: Map<string, number>,
  discountApprovedAt: Date | null
): DiscountInfo | null {
  if (items.length === 0) return null;

  let itemizedTotal = 0;
  let referenceTotal = 0;
  for (const item of items) {
    itemizedTotal += item.qty * item.unitPrice;
    const ref = referencePriceByProduct.get(item.productId);
    if (ref != null) referenceTotal += item.qty * ref;
  }
  if (referenceTotal <= 0) return null;

  const discountAmount = Math.max(0, referenceTotal - itemizedTotal);
  const discountPct = (discountAmount / referenceTotal) * 100;

  return {
    itemizedTotal,
    referenceTotal,
    discountAmount,
    discountPct,
    needsApproval: discountPct > DISCOUNT_APPROVAL_THRESHOLD_PCT && !discountApprovedAt,
  };
}
