// Which products are "the same model" for sales history: the model code in
// the product name (MDV-V48WDHN1(AtB), MVC-730WV2GN1, MOV-192HN1-R,
// MCD-24CRN1...), ignoring spacing and punctuation - so the codes of one
// model (e.g. a code and its "SN" twin) count together, while the type
// stays apart (Atom-B (AtB) vs Atom-C (AtC), VC Pro MVC vs VC Max MVC-M).
// A name with no model code falls back to the whole name.

const NOT_A_SERIES = new Set(["CAC", "MIDEA", "AC", "VRF", "SPARES", "INDUSTRIAL", "PARTS", "CASSETTE", "DUCT", "UNIT", "OUTDOOR", "INDOOR"]);
const CODE = /\b([A-Z]{2,6})\s*-\s*([A-Z]{0,2}\d{2,4}[A-Z0-9/]*(?:\s*\((?:AT[A-Z]|[A-Z]{1,3})\))?(?:-[A-Z0-9]+)*)/gi;

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function modelKey(model: string): string {
  let last: string | null = null;
  for (const m of model.matchAll(CODE)) {
    if (NOT_A_SERIES.has(m[1].toUpperCase())) continue;
    last = `${m[1]}-${m[2]}`;
  }
  return last ? norm(last) : norm(model);
}

// The model code as written, for showing which model the history is for.
export function modelCodeOf(model: string): string {
  let last: string | null = null;
  for (const m of model.matchAll(CODE)) if (!NOT_A_SERIES.has(m[1].toUpperCase())) last = `${m[1].toUpperCase()}-${m[2].replace(/\s+/g, "")}`;
  return last ?? model;
}
