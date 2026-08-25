# Personal blog with inline, runnable code

A standalone blog (Astro + MDX), independent of the CAC_CRM app in the rest
of this repo. Code examples run live in the visitor's browser via WASM —
no server-side execution, no backend to operate.

## Stack

- **Astro** for content/routing — islands mean the WASM runtime only loads
  on pages that actually use it, not on every page load.
- **MDX** for posts, so a post can mix prose with a `<CodeRunner />` island.
- **React** (`@astrojs/react`) just for the `CodeRunner` island itself.

## Running locally

```sh
cd blog
npm install
npm run dev
```

## How a runnable block works

Authors write:

```mdx
import CodeRunner from "../../components/CodeRunner.tsx";

<CodeRunner client:visible lang="python" code={`print("hi")`} />
```

`CodeRunner` (`src/components/CodeRunner.tsx`) is a plain editable textarea +
Run button + output pane. It doesn't know anything about Python
specifically — it looks up a `LanguageRuntime` for whatever `lang` prop it's
given (`src/runtimes/index.ts`) and calls `load()` then `run()` on it.

`client:visible` means the island (and its JS) only hydrates once the block
scrolls into view — and the runtime itself is only downloaded on the first
click of Run, not on page load.

## Language status

| Language | Status | Notes |
| --- | --- | --- |
| Python | ✅ working | [Pyodide](https://pyodide.org), self-hosted from `public/pyodide/` (copied from the npm package by `scripts/copy-pyodide-assets.mjs`) |
| R | 🚧 not wired up | [webR](https://docs.r-wasm.org/webr/latest/) has a similar JS API — add `src/runtimes/r.ts` and register it in `src/runtimes/index.ts` |
| Julia | ❌ blocked | no mature in-browser WASM runtime with an interactive REPL yet |
| Haskell | ❌ blocked | same — WASM compilation exists, an interactive REPL doesn't |

Until R/Julia/Haskell have real runtimes, blocks for those languages render
a "coming soon" / "not available" message (`UnsupportedRuntime` in
`src/runtimes/types.ts`) instead of crashing the page.

## Adding a new post

Drop an `.mdx` file in `src/content/blog/` with frontmatter matching the
schema in `src/content/config.ts` (`title`, `description`, `date`, `tags`).

## Security note

Code runs entirely client-side in the visitor's own browser tab (Pyodide is
sandboxed the same way any other WASM/JS in a page is) — nothing is sent to
a server, and there is no shared execution backend to secure or abuse.
