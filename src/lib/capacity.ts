// Manufacturer model numbers encode nominal capacity directly as digits,
// per product category (per the Head of Sales):
//   - Atom Mini VRF / Floor Standing: digits are kBTU/hr
//   - VRF: digits are kW x 10
//   - Rooftop: digits are TR x 10
// 1 TR = 3.5 kW (company convention); kBTU/hr -> kW is derived from the same
// convention (1 TR = 12 kBTU/hr), so the two stay internally consistent.
const KBTU_PER_KW = 12 / 3.5;

const CAPACITY_CATEGORIES = ["Atom Mini VRF", "VRF", "Rooftop", "Floor Standing"] as const;
export type CapacityCategory = (typeof CAPACITY_CATEGORIES)[number];

export function isCapacityCategory(category: string): category is CapacityCategory {
  return (CAPACITY_CATEGORIES as readonly string[]).includes(category);
}

const UNIT_WORDS = new Set(["TR", "HP", "BTU", "KW", "V", "PH", "HZ", "CMH", "A", "PHASE"]);

// Accessories/spares aren't capacity-rated AC units - a controller mentioned
// as an included feature ("with standard controllers") is fine and NOT
// excluded; only a controller/pipe/spare-part AS the product itself is.
const NON_CAPACITY_KEYWORDS = [
  "PARTS",
  "PIPE",
  "WIRED CONTROLLER",
  "REMOTE CONTROLLER",
  "CENTRAL CONTROLLER",
  "CONTROLLER CORDED",
];

// Finds the first digit-run (2-4 digits) in a product's `model` text that
// looks like it's embedded in the manufacturer's own SKU code, rather than
// a real-world value stated in the surrounding free text (e.g. "10TR",
// "R410a", "220~240V", "240,000 BTU", "78.5kW").
function extractCapacityDigits(model: string): number | null {
  const upper = model.toUpperCase();
  if (NON_CAPACITY_KEYWORDS.some((kw) => upper.includes(kw))) return null;

  const re = /\d{2,4}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(model))) {
    const digits = m[0];
    const start = m.index;
    const end = start + digits.length;

    // Skip refrigerant codes like R410A, R32, R22a (digits glued right after "R").
    if (start > 0 && model[start - 1].toUpperCase() === "R") continue;

    // Skip a big grouped number like "240,000" - never how a SKU code is written.
    if (model[end] === ",") continue;

    // Skip if followed by a real-world unit word, allowing an optional
    // "~digits"/"-digits" range (e.g. 220~240V) or ".digits" decimal
    // (e.g. 78.5kW) in between. Matched as startsWith, not exact equality,
    // since some rows run straight into the next word with no space
    // (e.g. "...50HzMIDEA CAC...").
    const rest = model.slice(end);
    const unitMatch = rest.match(/^(?:[~-]\d+|\.\d+)?\s?([A-Za-z]{1,6})/);
    if (unitMatch) {
      const captured = unitMatch[1].toUpperCase();
      if ([...UNIT_WORDS].some((w) => captured.startsWith(w))) continue;
    }

    return Number(digits);
  }
  return null;
}

/** Returns null for categories/models this rule doesn't cover, or where no capacity code was found (e.g. spare parts, controllers). */
export function computeCapacityKw(category: string, model: string): number | null {
  const digits = extractCapacityDigits(model);
  if (digits == null) return null;

  switch (category as CapacityCategory) {
    case "Atom Mini VRF":
    case "Floor Standing":
      return Math.round((digits / KBTU_PER_KW) * 100) / 100;
    case "VRF":
      return Math.round((digits / 10) * 100) / 100;
    case "Rooftop":
      return Math.round(((digits / 10) * 3.5) * 100) / 100;
    default:
      return null;
  }
}
