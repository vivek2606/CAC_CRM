import { prisma } from "@/lib/prisma";
import { normalizeCategory } from "@/lib/import/category";
import { computeCapacityKw } from "@/lib/capacity";

// Temporary codes for models seen for the first time (e.g. on an in-transit
// sheet before the ERP has a code for them). Replaced with the ERP code
// when the goods arrive - see assignProductCode().
export const TEMP_CODE_PREFIX = "TEMP-";

export function isTempCode(code: string): boolean {
  return code.toUpperCase().startsWith(TEMP_CODE_PREFIX);
}

// Model names are compared ignoring case, spaces and punctuation, so
// "MDV-D24Q4/N1-E(At)" and "mdv d24q4 n1 e at" match.
export function normalizeModel(model: string): string {
  return model.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function nextTempCodes(count: number): Promise<string[]> {
  const existing = await prisma.product.findMany({
    where: { code: { startsWith: TEMP_CODE_PREFIX, mode: "insensitive" } },
    select: { code: true },
  });
  let max = existing.reduce((m, p) => Math.max(m, Number(p.code.slice(TEMP_CODE_PREFIX.length)) || 0), 0);
  return Array.from({ length: count }, () => `${TEMP_CODE_PREFIX}${String(++max).padStart(4, "0")}`);
}

export type ProductMatch = {
  sheetCode: string | null;
  sheetModel: string | null;
  code: string;
  productModel: string;
  how: "code" | "model" | "model-partial" | "created-temp" | "created";
};

type SheetRow = { productCode: string | null; model: string | null; category: string | null };

// Resolves sheet rows to products:
//   1. a Product Code that exists is used as-is;
//   2. otherwise the Model is matched - exactly first, then as part of a
//      longer stored model name - and when several products carry that
//      model, the one used most recently (latest billing, else latest
//      price, else newest) wins;
//   3. otherwise a product is created: with the sheet's code if it gave
//      one, else a temporary TEMP-#### code, to be replaced by the ERP code
//      once the goods arrive.
export async function matchProductsByCodeOrModel(rows: SheetRow[]) {
  const products = await prisma.product.findMany({ select: { id: true, code: true, model: true, createdAt: true } });
  const [lastSale, lastPrice] = await Promise.all([
    prisma.saleLineItem.groupBy({ by: ["productId"], _max: { docDate: true } }),
    prisma.pricelist.groupBy({ by: ["productId"], _max: { month: true } }),
  ]);
  const saleAt = new Map(lastSale.map((s) => [s.productId, s._max.docDate?.getTime() ?? 0]));
  const priceAt = new Map(lastPrice.map((p) => [p.productId, p._max.month?.getTime() ?? 0]));
  const recency = (p: (typeof products)[number]) => [saleAt.get(p.id) ?? 0, priceAt.get(p.id) ?? 0, p.createdAt.getTime()];
  const newer = (a: (typeof products)[number], b: (typeof products)[number]) => {
    const [ra, rb] = [recency(a), recency(b)];
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i];
    return false;
  };

  const byCode = new Map(products.map((p) => [p.code.trim().toUpperCase(), p]));
  const normalized = products.map((p) => ({ p, n: normalizeModel(p.model) }));
  const pickLatest = (list: (typeof products)[number][]) => list.reduce((best, p) => (newer(p, best) ? p : best));

  const resolved = new Map<string, { id: string; match: ProductMatch }>();
  const keyFor = (r: SheetRow) => `${r.productCode?.trim().toUpperCase() ?? ""}|${r.model ? normalizeModel(r.model) : ""}`;
  const toCreate: SheetRow[] = [];

  for (const r of rows) {
    const key = keyFor(r);
    if (resolved.has(key) || toCreate.some((c) => keyFor(c) === key)) continue;
    const code = r.productCode?.trim();
    const hit = code ? byCode.get(code.toUpperCase()) : undefined;
    if (hit) {
      resolved.set(key, { id: hit.id, match: { sheetCode: code ?? null, sheetModel: r.model, code: hit.code, productModel: hit.model, how: "code" } });
      continue;
    }
    if (r.model) {
      const nm = normalizeModel(r.model);
      const exact = normalized.filter((x) => x.n === nm).map((x) => x.p);
      const partial = exact.length === 0 && nm.length >= 5 ? normalized.filter((x) => x.n.includes(nm)).map((x) => x.p) : [];
      const list = exact.length > 0 ? exact : partial;
      if (list.length > 0) {
        const p = pickLatest(list);
        resolved.set(key, {
          id: p.id,
          match: { sheetCode: code ?? null, sheetModel: r.model, code: p.code, productModel: p.model, how: exact.length > 0 ? "model" : "model-partial" },
        });
        continue;
      }
    }
    if (r.model) toCreate.push(r);
  }

  const tempCodes = await nextTempCodes(toCreate.filter((r) => !r.productCode?.trim()).length);
  for (const r of toCreate) {
    const code = r.productCode?.trim() || tempCodes.shift()!;
    const category = r.category ? normalizeCategory(r.category) : "Uncategorized";
    const created = await prisma.product.create({
      data: { code, brand: "MIDEA", category, subCategory: "Uncategorized", model: r.model!, capacityKw: computeCapacityKw(category, r.model!) },
      select: { id: true, code: true, model: true },
    });
    resolved.set(keyFor(r), {
      id: created.id,
      match: { sheetCode: r.productCode, sheetModel: r.model, code: created.code, productModel: created.model, how: r.productCode?.trim() ? "created" : "created-temp" },
    });
  }

  return {
    productIdFor: (r: SheetRow) => resolved.get(keyFor(r))?.id,
    matches: Array.from(resolved.values()).map((v) => v.match),
  };
}

// Gives a product its ERP code. When the code is free the product is simply
// renamed; when another product already has it (e.g. the ERP item arrived
// through a stock or sales upload first), a temporary product is merged
// into that one - its in-transit lines, receipts, pending orders, deal
// items and billing move across and the temporary product is removed.
// Returns the id of the product that now carries the code.
export async function assignProductCode(productId: string, newCode: string): Promise<string> {
  const code = newCode.trim();
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { id: true, code: true } });
  if (product.code === code) return product.id;
  const target = await prisma.product.findFirst({ where: { code: { equals: code, mode: "insensitive" } }, select: { id: true } });
  if (!target) {
    await prisma.product.update({ where: { id: productId }, data: { code } });
    return productId;
  }
  if (target.id === productId) return productId;
  if (!isTempCode(product.code)) {
    throw new Error(`Product code ${code} is already used by another product.`);
  }

  const [targetMonths, targetStock] = await Promise.all([
    prisma.pricelist.findMany({ where: { productId: target.id }, select: { month: true } }),
    prisma.productStock.findUnique({ where: { productId: target.id }, select: { id: true } }),
  ]);
  const takenMonths = targetMonths.map((m) => m.month);
  await prisma.$transaction([
    prisma.inTransitOrder.updateMany({ where: { productId }, data: { productId: target.id } }),
    prisma.stockReceipt.updateMany({ where: { productId }, data: { productId: target.id } }),
    prisma.pendingOrder.updateMany({ where: { productId }, data: { productId: target.id } }),
    prisma.dealLineItem.updateMany({ where: { productId }, data: { productId: target.id } }),
    prisma.saleLineItem.updateMany({ where: { productId }, data: { productId: target.id } }),
    // Price entries move unless the ERP product already has one that month.
    prisma.pricelist.deleteMany({ where: { productId, month: { in: takenMonths } } }),
    prisma.pricelist.updateMany({ where: { productId }, data: { productId: target.id } }),
    ...(targetStock
      ? [prisma.productStock.deleteMany({ where: { productId } })]
      : [prisma.productStock.updateMany({ where: { productId }, data: { productId: target.id } })]),
    prisma.product.delete({ where: { id: productId } }),
  ]);
  return target.id;
}
