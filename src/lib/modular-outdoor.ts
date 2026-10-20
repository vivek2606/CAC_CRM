// VRF outdoor units are modular: one module is at most 85 kW, and up to
// three modules combine into one outdoor of up to 255 kW. A model's number
// is its capacity in tenths of a kW (MVC-850WV2GN1 = 85 kW), so a combined
// one reads e.g. MVC-2250WV2GN1 (225 kW) - not a product of its own, but
// the modules it is made of.

export const MAX_MODULE_CODE = 850; // 85 kW
export const MAX_MODULES = 3;
export const MAX_COMBINED_CODE = MAX_MODULE_CODE * MAX_MODULES;
export const VRF_SERIES = ["MVC", "MVC-M", "MVX", "MVX-i"] as const;

// "MVC-850WV2GN1", "MVX - i730WV2GN1", "MVC-M224WV2GN1", or just "2250W".
const MODEL = /(?:\b(MV[CX])\s*-?\s*([MI])?\s*-?\s*)?(\d{3,4})\s*W/i;

export type VrfModel = { series: string | null; code: number };

export function parseVrfModel(text: string): VrfModel | null {
  const m = MODEL.exec(text);
  if (!m) return null;
  const series = m[1] ? m[1].toUpperCase() + (m[2] ? (m[2].toUpperCase() === "I" ? "-i" : "-M") : "") : null;
  return { series, code: Number(m[3]) };
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
