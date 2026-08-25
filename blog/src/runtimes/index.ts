import type { LanguageRuntime } from "./types";
import { UnsupportedRuntime } from "./types";
import { pythonRuntime } from "./python";

// Register a runtime here to light up a new language across the whole
// blog. R (via webR), Julia, and Haskell don't yet have a runtime wired
// up — no mature in-browser WASM interpreter exists for the latter two,
// and webR support is planned. Until then they render as "coming soon".
const registry: Record<string, LanguageRuntime> = {
  python: pythonRuntime,
  r: new UnsupportedRuntime("r", "R", "R support (via webR) is coming soon."),
  julia: new UnsupportedRuntime(
    "julia",
    "Julia",
    "Julia has no mature in-browser WASM runtime yet, so live execution isn't available.",
  ),
  haskell: new UnsupportedRuntime(
    "haskell",
    "Haskell",
    "Haskell has no mature in-browser WASM runtime yet, so live execution isn't available.",
  ),
};

export function getRuntime(lang: string): LanguageRuntime {
  const runtime = registry[lang.toLowerCase()];
  if (!runtime) {
    return new UnsupportedRuntime(lang, lang, `Unknown language "${lang}".`);
  }
  return runtime;
}
