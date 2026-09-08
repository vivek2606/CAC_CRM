// Fixed-order categorical palette (CVD-safe order, per the dataviz skill's
// validated reference palette) for charts that color a data-driven set of
// category names rather than a fixed enum - unlike END_USE_SEGMENT_COLORS,
// which maps a small closed set. Slots are assigned in rank order (caller
// decides the ranking, typically largest-value-first); anything past the
// 8th slot folds into a shared "Other" color instead of generating a new
// hue, per the skill's series-count ladder.
export const CATEGORY_PALETTE = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];
export const CATEGORY_OTHER_COLOR = "#94a3b8"; // slate-400, muted/neutral
export const MAX_CATEGORY_SLOTS = CATEGORY_PALETTE.length;
export const OTHER_CATEGORY_LABEL = "Other";

// categoriesByRank: category names ordered largest-first (or whatever
// ranking the caller wants slot priority to follow).
export function assignCategoryColors(categoriesByRank: string[]): Map<string, string> {
  const map = new Map<string, string>();
  categoriesByRank.forEach((cat, i) => {
    map.set(cat, i < MAX_CATEGORY_SLOTS ? CATEGORY_PALETTE[i] : CATEGORY_OTHER_COLOR);
  });
  return map;
}
