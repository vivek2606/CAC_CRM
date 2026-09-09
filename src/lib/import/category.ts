// The Head of Sales confirmed "Atom" and "Atom Mini VRF" are the same
// product line - different source files (Price Master vs. Sales Register,
// across different months) have used both names for it over time. Without
// this, they'd land as two separate Product.category values: splitting one
// category's sales across two rows in Sales by Category, and silently
// breaking capacity (kW) computation for "Atom" rows, since that logic
// matches on the exact string "Atom Mini VRF".
//
// Same reasoning for "Floorstanding" vs "Floor Standing" - just a spacing
// difference across source files, but Product.category is matched as an
// exact string everywhere (capacity lookup, Sales by Category, Targets), so
// left alone it silently splits one category into two.
export function normalizeCategory(category: string): string {
  const trimmed = category.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "atom" || lower === "atom mini vrf") return "Atom Mini VRF";
  if (lower === "floorstanding" || lower === "floor standing") return "Floor Standing";
  return trimmed;
}
