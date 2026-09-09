import type { RawTentativePriceRow } from "./parse-tentative-pricelist";

export type TransformedTentativePrice = { model: string; dealerPrice: number };

export type TentativePricelistTransformResult = {
  priceEntries: TransformedTentativePrice[];
  summary: { totalRowsIn: number; keptRows: number };
};

// This sheet carries nothing but a model name and a tentative dealer price -
// no product code, no category, and no relation to sales-register history.
// Matching that model name against the existing product catalog happens in
// the server action, not here.
export function transformTentativePricelist(rows: RawTentativePriceRow[]): TentativePricelistTransformResult {
  const totalRowsIn = rows.length;

  // Last row for a model wins, in case the sheet lists it twice.
  const priceMap = new Map<string, TransformedTentativePrice>();
  for (const row of rows) {
    const model = row.model.trim();
    priceMap.set(model.toLowerCase(), { model, dealerPrice: row.dealerPrice });
  }

  return {
    priceEntries: Array.from(priceMap.values()),
    summary: { totalRowsIn, keptRows: priceMap.size },
  };
}
