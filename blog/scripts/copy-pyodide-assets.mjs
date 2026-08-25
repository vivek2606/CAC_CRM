// Pyodide's runtime assets (wasm, stdlib zip, lock file, loader) aren't
// meant to be bundled by Vite — they're fetched at runtime from a plain
// static URL (indexURL). This copies them from node_modules into public/
// so the blog is self-contained and doesn't depend on a third-party CDN.
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules", "pyodide");
const dest = join(root, "public", "pyodide");

const assets = [
  "pyodide.js",
  "pyodide.mjs",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "pyodide-lock.json",
  "python_stdlib.zip",
];

await mkdir(dest, { recursive: true });
await Promise.all(assets.map((file) => cp(join(src, file), join(dest, file))));
console.log(`Copied ${assets.length} Pyodide assets to public/pyodide/`);
