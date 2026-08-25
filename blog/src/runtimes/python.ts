import type { LanguageRuntime, RunResult } from "./types";

// Self-hosted rather than CDN-loaded: scripts/copy-pyodide-assets.mjs copies
// these files from node_modules/pyodide into public/pyodide/ at dev/build
// time, so the blog has no runtime dependency on a third-party CDN.
const PYODIDE_BASE_URL = "/pyodide/";

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<PyodideInterface>;
  }
}

interface PyodideInterface {
  runPythonAsync(code: string): Promise<unknown>;
  setStdout(options: { batched: (msg: string) => void }): void;
  setStderr(options: { batched: (msg: string) => void }): void;
}

let scriptPromise: Promise<void> | null = null;
let pyodidePromise: Promise<PyodideInterface> | null = null;
let pyodide: PyodideInterface | null = null;

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.loadPyodide) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `${PYODIDE_BASE_URL}pyodide.js`;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load the Python runtime. Check your network connection."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

class PythonRuntime implements LanguageRuntime {
  id = "python";
  label = "Python";

  isLoaded(): boolean {
    return pyodide !== null;
  }

  async load(onStatus: (message: string) => void): Promise<void> {
    if (pyodide) return;
    if (!pyodidePromise) {
      pyodidePromise = (async () => {
        onStatus("Downloading Python runtime (Pyodide, ~10 MB, cached after first run)…");
        await loadScript();
        onStatus("Starting interpreter…");
        const instance = await window.loadPyodide!({ indexURL: PYODIDE_BASE_URL });
        pyodide = instance;
        return instance;
      })();
    }
    await pyodidePromise;
  }

  async run(code: string): Promise<RunResult> {
    if (!pyodide) {
      return { ok: false, stdout: "", error: "Runtime not loaded yet." };
    }
    let stdout = "";
    pyodide.setStdout({ batched: (msg) => (stdout += msg + "\n") });
    pyodide.setStderr({ batched: (msg) => (stdout += msg + "\n") });
    try {
      const result = await pyodide.runPythonAsync(code);
      if (result !== undefined && result !== null) {
        stdout += `${result}\n`;
      }
      return { ok: true, stdout };
    } catch (err) {
      return {
        ok: false,
        stdout,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const pythonRuntime = new PythonRuntime();
