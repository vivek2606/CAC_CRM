// Part-billed orders (Mark Won).

// The deal's products not billed on any of the invoices: per product, the
// quantity on the deal less what was billed (sales returns aside), at the
// deal's rate.
export type Unbilled = { productId: string; model: string; qty: number; unitPrice: number };
export function unbilled(
  items: { productId: string; qty: number; unitPrice: number }[],
  invoices: { items: { productId: string; qty: number }[] }[],
): Unbilled[] {
  const billed = new Map<string, number>();
  for (const inv of invoices) for (const i of inv.items) if (i.qty > 0) billed.set(i.productId, (billed.get(i.productId) ?? 0) + i.qty);
  const out: Unbilled[] = [];
  for (const it of items) {
    if (it.qty <= 0) continue;
    const b = billed.get(it.productId) ?? 0;
    const qty = Math.round((it.qty - b) * 100) / 100;
    billed.set(it.productId, Math.max(0, b - it.qty));
    if (qty > 0) out.push({ productId: it.productId, model: "", qty, unitPrice: it.unitPrice });
  }
  return out;
}
