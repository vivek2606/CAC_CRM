import { prisma } from "@/lib/prisma";
import { getLatestPriceByProduct } from "@/lib/pricing";
import { getCompanySettings } from "@/lib/company-profile";
import type { SalesDocument } from "@/lib/sales-document";

// Discounts on a quotation / proforma / BOQ beyond each item's permissible
// maximum (Product.maxDiscountPct, from the Stock & Price List upload).
// The discount is measured against the item's dealer's price, from the net
// rate quoted - so a rate typed in below the dealer's price counts too, not
// only the Disc. % column.

export type ExcessLine = {
  productId: string;
  description: string;
  listRate: number; // dealer's price, as quoted (incl. VAT in an inclusive quote)
  netRate: number;
  discountPct: number; // off the dealer's price
  maxPct: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function excessDiscounts(doc: SalesDocument): Promise<ExcessLine[]> {
  const items = doc.rows.filter((r) => r.kind === "item" && r.productId && r.qty > 0) as Extract<SalesDocument["rows"][number], { kind: "item" }>[];
  if (!items.length) return [];
  const ids = [...new Set(items.map((r) => r.productId!))];
  const [products, prices, settings] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: ids }, maxDiscountPct: { not: null } }, select: { id: true, maxDiscountPct: true } }),
    getLatestPriceByProduct(),
    getCompanySettings(),
  ]);
  const maxById = new Map(products.map((p) => [p.id, p.maxDiscountPct!]));
  const vatFactor = doc.vatInclusive ? 1 + settings.vatRatePct / 100 : 1;
  const out: ExcessLine[] = [];
  for (const r of items) {
    const maxPct = maxById.get(r.productId!);
    const price = prices.get(r.productId!);
    if (maxPct == null || !price) continue;
    const listRate = round2(price * vatFactor);
    const discountPct = round2(Math.max(0, (1 - r.netRate / listRate) * 100));
    if (discountPct > maxPct + 0.005) out.push({ productId: r.productId!, description: r.description, listRate, netRate: r.netRate, discountPct, maxPct });
  }
  return out;
}

// Whether every over-the-limit line is within what the Head approved for
// this quotation (same item, discount no bigger than approved).
export function coveredByApproval(lines: ExcessLine[], approved: unknown): boolean {
  if (!lines.length) return true;
  if (!Array.isArray(approved)) return false;
  const ok = new Map<string, number>();
  for (const a of approved as ExcessLine[]) ok.set(a.productId, Math.max(ok.get(a.productId) ?? 0, a.discountPct));
  return lines.every((l) => l.discountPct <= (ok.get(l.productId) ?? -1) + 0.005);
}
