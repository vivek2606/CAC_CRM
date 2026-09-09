import type { RawTentativePriceRow } from "./parse-tentative-pricelist";
import { computeCapacityKw } from "@/lib/capacity";

export type TransformedProduct = {
  code: string;
  category: string;
  model: string;
  capacityKw: number | null;
};
export type TransformedTentativePrice = { productCode: string; dealerPrice: number };

export type TentativePricelistTransformResult = {
  products: TransformedProduct[];
  priceEntries: TransformedTentativePrice[];
  summary: { totalRowsIn: number; keptRows: number };
};

export function transformTentativePricelist(rows: RawTentativePriceRow[]): TentativePricelistTransformResult {
  const totalRowsIn = rows.length;

  // Last row for a product code wins, in case the sheet lists it twice.
  const productMap = new Map<string, TransformedProduct>();
  const priceMap = new Map<string, TransformedTentativePrice>();

  for (const row of rows) {
    productMap.set(row.productCode, {
      code: row.productCode,
      category: row.category,
      model: row.model,
      capacityKw: computeCapacityKw(row.category, row.model),
    });
    priceMap.set(row.productCode, { productCode: row.productCode, dealerPrice: row.dealerPrice });
  }

  return {
    products: Array.from(productMap.values()),
    priceEntries: Array.from(priceMap.values()),
    summary: { totalRowsIn, keptRows: productMap.size },
  };
}
