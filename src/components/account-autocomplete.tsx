"use client";

import { useEffect, useRef, useState } from "react";

type Option = { id: string; label: string };

// Type-to-search replacement for a plain <select> of accounts - filters the
// already-loaded accounts list client-side (there's no need for a server
// round-trip at this list size) and submits the picked account's id via a
// hidden input, same field name a <select name="accountId"> would use.
export function AccountAutocomplete({
  name,
  accounts,
  defaultAccountId,
  defaultLabel,
  placeholder = "Type to search accounts...",
}: {
  name: string;
  accounts: Option[];
  defaultAccountId?: string | null;
  defaultLabel?: string | null;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(defaultLabel ?? "");
  const [selectedId, setSelectedId] = useState(defaultAccountId ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches =
    query.trim() === ""
      ? accounts.slice(0, 8)
      : accounts.filter((a) => a.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectAccount(account: Option) {
    setQuery(account.label);
    setSelectedId(account.id);
    setOpen(false);
  }

  function handleChange(value: string) {
    setQuery(value);
    setSelectedId("");
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
      e.preventDefault();
      selectAccount(matches[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={selectedId} />
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
          {matches.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectAccount(a)}
                className={`w-full text-left px-3 py-1.5 text-sm ${
                  i === highlight ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() !== "" && selectedId === "" && (
        <p className="mt-1 text-xs text-slate-400">
          {matches.length > 0 ? "No exact match selected - pick one from the list, or leave unlinked." : "No matching account - this contact will be left unlinked."}
        </p>
      )}
    </div>
  );
}
