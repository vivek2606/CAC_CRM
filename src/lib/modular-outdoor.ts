// VRF outdoor units are modular: one module is at most 85 kW, and up to
// three modules combine into one outdoor of up to 255 kW. A model's number
// is its capacity in tenths of a kW (MVC-850WV2GN1 = 85 kW), so a combined
// one reads e.g. MVC-M2250WV2GN1 (225 kW, VC Max) - not a product of its
// own, but the modules it is made of.

export const MAX_MODULE_CODE = 850; // 85 kW
export const MAX_MODULES = 3;
export const MAX_COMBINED_CODE = MAX_MODULE_CODE * MAX_MODULES;
export const VRF_SERIES = ["MVC-M", "MVC", "MVX", "MVX-i"] as const;
// Combined outdoors are VC Max (MVC-M) unless the model says otherwise.
export const DEFAULT_VRF_SERIES = "MVC-M";

// "MVC-M2250", "MVC-850WV2GN1", "MVX - i730WV2GN1", "MVC-M224WV2GN1" - or
// just a capacity with its W, "2250W".
const WITH_SERIES = /\b(MV[CX])\s*-?\s*([MI])?\s*-?\s*(\d{3,4})(?!\d)/i;
const NUMBER_ONLY = /\b(\d{3,4})\s*W/i;

export type VrfModel = { series: string | null; code: number };

export function parseVrfModel(text: string): VrfModel | null {
  const m = WITH_SERIES.exec(text);
  if (m) return { series: m[1].toUpperCase() + (m[2] ? (m[2].toUpperCase() === "I" ? "-i" : "-M") : ""), code: Number(m[3]) };
  const n = NUMBER_ONLY.exec(text);
  return n ? { series: null, code: Number(n[1]) } : null;
}

// Typed into a product search: a combined outdoor (over one module, up to three).
export function combinedOutdoorIn(query: string): VrfModel | null {
  const v = parseVrfModel(query);
  return v && v.code > MAX_MODULE_CODE && v.code <= MAX_COMBINED_CODE ? v : null;
}

export const kW = (code: number) => code / 10;
export const vrfModelName = (series: string, code: number) => `${series}${series.includes("-") ? "" : "-"}${code}WV2GN1`;

// A break-up of `target` into up to three of the available module
// capacities, adding up exactly: fewest modules first, then the biggest.
// With no exact one: the closest (at or over the capacity before under it,
// then fewest modules) - exact says which it is.
export function closestBreakup(target: number, capacities: number[]): { caps: number[]; exact: boolean } | null {
  const exact = suggestBreakup(target, capacities);
  if (exact) return { caps: exact, exact: true };
  const caps = [...new Set(capacities)].filter((c) => c > 0 && c <= MAX_MODULE_CODE).sort((a, b) => b - a);
  let best: number[] | null = null;
  const score = (combo: number[]) => {
    const diff = combo.reduce((t, c) => t + c, 0) - target;
    return [diff >= 0 ? 0 : 1, Math.abs(diff), combo.length];
  };
  const better = (a: number[], b: number[]) => {
    const [x, y] = [score(a), score(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
    return false;
  };
  const walk = (combo: number[], from: number) => {
    if (combo.length && (!best || better(combo, best))) best = [...combo];
    if (combo.length === MAX_MODULES) return;
    for (let i = from; i < caps.length; i++) walk([...combo, caps[i]], i);
  };
  walk([], 0);
  return best ? { caps: best, exact: false } : null;
}

export function suggestBreakup(target: number, capacities: number[]): number[] | null {
  const caps = [...new Set(capacities)].filter((c) => c > 0 && c <= MAX_MODULE_CODE).sort((a, b) => b - a);
  for (let n = 1; n <= MAX_MODULES; n++) {
    const pick = (left: number, k: number, from: number): number[] | null => {
      if (k === 0) return left === 0 ? [] : null;
      for (let i = from; i < caps.length; i++) {
        if (caps[i] > left) continue;
        const rest = pick(left - caps[i], k - 1, i);
        if (rest) return [caps[i], ...rest];
      }
      return null;
    };
    const found = pick(target, n, 0);
    if (found) return found;
  }
  return null;
}
