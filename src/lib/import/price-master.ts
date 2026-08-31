import type { RawPriceMasterRow } from "./parse-price-master";
import { computeCapacityKw } from "@/lib/capacity";

export type TransformedProduct = {
  code: string;
  brand: string;
  category: string;
  subCategory: string;
  model: string;
  capacityKw: number | null;
};
export type TransformedPriceEntry = { productCode: string; dealerPrice: number };

export type PriceMasterTransformResult = {
  products: TransformedProduct[];
  priceEntries: TransformedPriceEntry[];
  summary: { totalRowsIn: number; keptRows: number };
};

export function transformPriceMaster(rows: RawPriceMasterRow[]): PriceMasterTransformResult {
  const totalRowsIn = rows.length;

  // Last row for a product code wins, in case the sheet lists it twice.
  const productMap = new Map<string, TransformedProduct>();
  const priceMap = new Map<string, TransformedPriceEntry>();
  for (const row of rows) {
    productMap.set(row.productCode, {
      code: row.productCode,
      brand: row.brand ?? "MIDEA",
      category: row.category,
      subCategory: row.subCategory,
      model: row.model,
      // The sheet's own Capacity (kW) column wins if supplied; otherwise
      // derive it from the model number for the categories that encode it.
      capacityKw: row.capacityKw ?? computeCapacityKw(row.category, row.model),
    });
    priceMap.set(row.productCode, { productCode: row.productCode, dealerPrice: row.dealerPrice });
  }

  return {
    products: Array.from(productMap.values()),
    priceEntries: Array.from(priceMap.values()),
    summary: { totalRowsIn, keptRows: productMap.size },
  };
}
