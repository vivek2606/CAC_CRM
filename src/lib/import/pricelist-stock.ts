import type { RawPricelistRow } from "./parse-pricelist";
import { computeCapacityKw } from "@/lib/capacity";

export type TransformedProduct = {
  code: string;
  category: string;
  model: string;
  capacityKw: number | null;
};
export type TransformedPriceEntry = {
  productCode: string;
  month: Date;
  landedCost: number;
  dealerPrice: number;
};
export type TransformedStockEntry = { productCode: string; quantity: number };

export type PricelistStockTransformResult = {
  products: TransformedProduct[];
  priceEntries: TransformedPriceEntry[];
  stockEntries: TransformedStockEntry[];
  summary: { totalRowsIn: number; keptRows: number };
};

export function transformPricelistStock(rows: RawPricelistRow[]): PricelistStockTransformResult {
  const totalRowsIn = rows.length;

  // Last row for a product code wins, in case the sheet lists it twice.
  const productMap = new Map<string, TransformedProduct>();
  const priceMap = new Map<string, TransformedPriceEntry>();
  const stockMap = new Map<string, TransformedStockEntry>();

  for (const row of rows) {
    productMap.set(row.productCode, {
      code: row.productCode,
      category: row.category,
      model: row.model,
      capacityKw: computeCapacityKw(row.category, row.model),
    });
    priceMap.set(row.productCode, {
      productCode: row.productCode,
      month: row.month,
      landedCost: row.landedCost,
      dealerPrice: row.dealerPrice,
    });
    stockMap.set(row.productCode, { productCode: row.productCode, quantity: row.quantity });
  }

  return {
    products: Array.from(productMap.values()),
    priceEntries: Array.from(priceMap.values()),
    stockEntries: Array.from(stockMap.values()),
    summary: { totalRowsIn, keptRows: productMap.size },
  };
}
