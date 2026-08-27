"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { Search, Target, Building2, Contact, KanbanSquare, X } from "lucide-react";
import { searchAll, type SearchResults } from "./search-actions";
import { DEAL_STAGE_LABELS } from "@/lib/constants";

const EMPTY: SearchResults = { leads: [], accounts: [], contacts: [], deals: [] };

export function SearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      setLoading(true);
      searchAll(q)
        .then((r) => setResults(r))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const hasQuery = query.trim().length >= 2;
  const totalCount = results.leads.length + results.accounts.length + results.contacts.length + results.deals.length;

  function closeAndClear() {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    setLoading(false);
  }

  return (
    <div ref={boxRef} className="relative flex-1 max-w-md">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            setOpen(true);
            if (value.trim().length < 2) {
              setResults(EMPTY);
              setLoading(false);
            }
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search leads, accounts, contacts, deals..."
          className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
        />
        {query && (
          <button
            onClick={closeAndClear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && hasQuery && (
        <div className="absolute left-0 right-0 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg z-50">
          {loading && totalCount === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">Searching…</p>
          ) : totalCount === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">No matches for &quot;{query}&quot;</p>
          ) : (
            <div className="py-2">
              <ResultGroup label="Leads" icon={Target} count={results.leads.length}>
                {results.leads.map((l) => (
                  <ResultRow key={l.id} href={`/leads/${l.id}`} title={l.title} subtitle={l.company} onNavigate={closeAndClear} />
                ))}
              </ResultGroup>
              <ResultGroup label="Accounts" icon={Building2} count={results.accounts.length}>
                {results.accounts.map((a) => (
                  <ResultRow key={a.id} href={`/accounts/${a.id}`} title={a.name} subtitle={a.city} onNavigate={closeAndClear} />
                ))}
              </ResultGroup>
              <ResultGroup label="Contacts" icon={Contact} count={results.contacts.length}>
                {results.contacts.map((c) => (
                  <ResultRow key={c.id} href={`/contacts/${c.id}`} title={c.name} subtitle={c.jobTitle} onNavigate={closeAndClear} />
                ))}
              </ResultGroup>
              <ResultGroup label="Deals" icon={KanbanSquare} count={results.deals.length}>
                {results.deals.map((d) => (
                  <ResultRow
                    key={d.id}
                    href={`/deals/${d.id}`}
                    title={d.title}
                    subtitle={DEAL_STAGE_LABELS[d.stage as keyof typeof DEAL_STAGE_LABELS]}
                    onNavigate={closeAndClear}
                  />
                ))}
              </ResultGroup>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  label,
  icon: Icon,
  count,
  children,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  count: number;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="px-2">
      <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      {children}
    </div>
  );
}

function ResultRow({
  href,
  title,
  subtitle,
  onNavigate,
}: {
  href: string;
  title: string;
  subtitle?: string | null;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex flex-col rounded-lg px-2 py-1.5 hover:bg-slate-50 transition-colors"
    >
      <span className="text-sm text-slate-800 truncate">{title}</span>
      {subtitle && <span className="text-xs text-slate-400 truncate">{subtitle}</span>}
    </Link>
  );
}
