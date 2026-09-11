"use client";

import { useEffect, useRef, useState } from "react";

// Free-text field with autocomplete suggestions drawn from existing values -
// pick one of the suggestions, or type something new to add it. Unlike
// SearchableSelect there's no separate id here: the typed/picked text is
// itself the value that gets submitted, since the underlying field (e.g.
// Product.category) is a plain string, not a foreign key.
export function CreatableTextSelect({
  name,
  options,
  defaultValue,
  required,
  placeholder = "Type to search or add new...",
}: {
  name: string;
  options: string[];
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmed = value.trim();
  const matches =
    trimmed === "" ? options.slice(0, 8) : options.filter((o) => o.toLowerCase().includes(trimmed.toLowerCase())).slice(0, 8);
  const isNew = trimmed !== "" && !options.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pick(option: string) {
    setValue(option);
    setOpen(false);
  }

  function handleChange(text: string) {
    setValue(text);
    setHighlight(0);
    setOpen(true);
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
      if (matches[highlight]) {
        e.preventDefault();
        pick(matches[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        name={name}
        type="text"
        required={required}
        value={value}
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
            <li key={o}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                className={`w-full text-left px-3 py-1.5 text-sm ${
                  i === highlight ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
      {isNew && <p className="mt-1 text-xs text-indigo-600">&quot;{trimmed}&quot; will be added as a new option.</p>}
    </div>
  );
}
