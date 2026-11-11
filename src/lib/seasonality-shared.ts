// Seasonality helpers safe to use in the browser.
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const ALL = "All categories";

// A yearly figure split into months by a pattern (% shares); an empty
// pattern splits evenly. Rounded to whole naira, the total kept exact.
export function splitByPattern(total: number, share: number[]): number[] {
  const sum = share.reduce((s, v) => s + v, 0);
  const weights = sum > 0 ? share.map((v) => v / sum) : Array(12).fill(1 / 12);
  const parts = weights.map((w) => Math.round(total * w));
  parts[parts.indexOf(Math.max(...parts))] += Math.round(total) - parts.reduce((s, v) => s + v, 0);
  return parts;
}
