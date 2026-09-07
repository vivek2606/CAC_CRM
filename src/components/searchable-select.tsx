"use client";

import { useEffect, useRef, useState } from "react";

export type SearchableOption = { id: string; label: string };

// Type-to-search replacement for a plain <select> over a list backed by
// historic/growing data (accounts, contacts, products) - filters
// client-side as you type instead of making the user scroll a long
// dropdown. Two ways to use it:
//   - Form field: pass `name` (+ optionally `defaultValue`) and it behaves
//     like an uncontrolled <select name=...>, submitting the picked id via
//     a hidden input.
//   - Controlled: pass `value` + `onSelect` and no `name`, for a value that
//     lives in the parent's own state (e.g. one row of a repeater) - it
//     stays in sync if the parent changes `value` from outside.
export function SearchableSelect({
  name,
  options,
  value,
  defaultValue,
  onSelect,
  placeholder = "Type to search...",
  emptyLabel = "none",
}: {
  name?: string;
  options: SearchableOption[];
  value?: string;
  defaultValue?: string;
  onSelect?: (option: SearchableOption | null) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const resolveLabel = (id: string) => options.find((o) => o.id === id)?.label ?? "";

  const [selectedId, setSelectedId] = useState(value ?? defaultValue ?? "");
  const [query, setQuery] = useState(resolveLabel(value ?? defaultValue ?? ""));
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Controlled mode: re-sync if the parent's value changes out from under us
  // (e.g. a repeater row shifting index after another row is removed).
  // Adjusting state during render (React's documented pattern for this)
  // instead of in an effect, so there's no extra render pass.
  const [trackedValue, setTrackedValue] = useState(value);
  if (value !== undefined && value !== trackedValue) {
    setTrackedValue(value);
    setSelectedId(value);
    setQuery(resolveLabel(value));
  }

  const matches =
    query.trim() === ""
      ? options.slice(0, 8)
      : options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pick(option: SearchableOption | null) {
    setSelectedId(option?.id ?? "");
    setQuery(option?.label ?? "");
    setOpen(false);
    onSelect?.(option);
  }

  function handleChange(text: string) {
    setQuery(text);
    setSelectedId("");
    setHighlight(0);
    setOpen(true);
    if (text.trim() === "") onSelect?.(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(matches[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {name && <input type="hidden" name={name} value={selectedId} />}
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {matches.map((o, i) => (
            <li key={o.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                className={`w-full text-left px-3 py-1.5 text-sm ${
                  i === highlight ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() !== "" && selectedId === "" && (
        <p className="mt-1 text-xs text-slate-400">
          {matches.length > 0
            ? `No exact match selected - pick one from the list, or leave as ${emptyLabel}.`
            : `No match - this will be left as ${emptyLabel}.`}
        </p>
      )}
    </div>
  );
}
