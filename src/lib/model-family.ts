// Which products are "the same model" for sales history: the model code in
// the product name (MDV-V48WDHN1(AtB), MVC-730WV2GN1, MOV-192HN1-R,
// MCD-24CRN1...), ignoring spacing and punctuation - so the codes of one
// model (e.g. a code and its "SN" twin) count together, while the type
// stays apart (Atom-B (AtB) vs Atom-C (AtC), VC Pro MVC vs VC Max MVC-M).
// A name with no model code falls back to the whole name.

const NOT_A_SERIES = new Set(["CAC", "MIDEA", "AC", "VRF", "SPARES", "INDUSTRIAL", "PARTS", "CASSETTE", "DUCT", "UNIT", "OUTDOOR", "INDOOR"]);
// The series starts with a letter and may hold digits (MI2-, MV6-).
const CODE = /\b([A-Z][A-Z0-9]{1,5})\s*-\s*([A-Z]{0,2}\d{2,4}[A-Z0-9/]*(?:\s*\((?:AT[A-Z]|[A-Z]{1,3})\))?(?:-[A-Z0-9]+)*)/gi;

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

// The first model code in the name (later ones are packing / kit notes,
// e.g. "MI2-18GDHN18(At) - IN SKD - 18kBTU/Hr").
function firstCode(model: string): RegExpMatchArray | null {
  for (const m of model.matchAll(CODE)) if (!NOT_A_SERIES.has(m[1].toUpperCase()) && !/^R\d/i.test(m[1])) return m;
  return null;
}

export function modelKey(model: string): string {
  const m = firstCode(model);
  return m ? norm(`${m[1]}-${m[2]}`) : norm(model);
}

// The model code as written, for showing which model the history is for.
export function modelCodeOf(model: string): string {
  const m = firstCode(model);
  return m ? `${m[1].toUpperCase()}-${m[2].replace(/\s+/g, "")}` : model;
}
