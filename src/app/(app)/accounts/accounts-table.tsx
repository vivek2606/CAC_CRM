"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, EmptyState, Avatar } from "@/components/ui";
import { TagChips } from "@/components/tag-chips";
import { SortableTh } from "@/components/sortable-th";
import { ChevronLeft, ChevronRight } from "lucide-react";

type SortKey = "name" | "industry" | "city" | "contactCount" | "dealCount" | "owner";
type SortDir = "asc" | "desc";

export type AccountRow = {
  id: string;
  name: string;
  code: string | null;
  website: string | null;
  industry: string | null;
  city: string | null;
  contactCount: number;
  dealCount: number;
  owner: { name: string; avatarColor: string };
  tags: string[];
};

const PAGE_SIZE = 50;

// Filters entirely client-side as you type, no submit button - the server
// loads every visible account up front and pagination happens locally over
// whatever's currently matched.
export function AccountsTable({ accounts }: { accounts: AccountRow[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows =
      q === ""
        ? accounts
        : accounts.filter((a) => a.name.toLowerCase().includes(q) || a.tags.some((t) => t.toLowerCase().includes(q)));
    if (!sortKey) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "industry":
          return (a.industry ?? "").localeCompare(b.industry ?? "") * dir;
        case "city":
          return (a.city ?? "").localeCompare(b.city ?? "") * dir;
        case "contactCount":
          return (a.contactCount - b.contactCount) * dir;
        case "dealCount":
          return (a.dealCount - b.dealCount) * dir;
        case "owner":
          return a.owner.name.localeCompare(b.owner.name) * dir;
      }
    });
  }, [accounts, query, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    setPage(1);
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageAccounts = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const start = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, filtered.length);

  function updateQuery(v: string) {
    setQuery(v);
    setPage(1);
  }

  return (
    <>
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="Search company name or tag..."
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {query && (
          <button type="button" onClick={() => updateQuery("")} className="text-sm text-slate-500 hover:text-slate-700">
            Clear
          </button>
        )}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="No accounts found" description="Try a different search, or add a new account." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <SortableTh label="Account" sortKey="name" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableTh
                    label="Industry"
                    sortKey="industry"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh label="City" sortKey="city" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableTh
                    label="Contacts"
                    sortKey="contactCount"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label="Deals"
                    sortKey="dealCount"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh label="Owner" sortKey="owner" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/accounts/${account.id}`} className="font-medium text-slate-800 hover:text-indigo-600">
                        {account.name}
                      </Link>
                      {account.code && <p className="text-xs text-slate-400">Code: {account.code}</p>}
                      {account.website && <p className="text-xs text-slate-400">{account.website}</p>}
                      <TagChips tags={account.tags} className="mt-1" />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{account.industry ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{account.city ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{account.contactCount}</td>
                    <td className="px-4 py-3 text-slate-600">{account.dealCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={account.owner.name} color={account.owner.avatarColor} size={6} />
                        <span className="text-slate-600">{account.owner.name}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm">
            <p className="text-slate-500">
              Showing {start}–{end} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className={`inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-600 ${
                  currentPage <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"
                }`}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <span className="text-slate-500 px-1">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className={`inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-600 ${
                  currentPage >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-slate-50"
                }`}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
