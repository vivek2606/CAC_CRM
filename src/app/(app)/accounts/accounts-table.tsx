"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, EmptyState, Avatar } from "@/components/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
};

const PAGE_SIZE = 50;

// Filters entirely client-side as you type, no submit button - the server
// loads every visible account up front and pagination happens locally over
// whatever's currently matched.
export function AccountsTable({ accounts }: { accounts: AccountRow[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === "" ? accounts : accounts.filter((a) => a.name.toLowerCase().includes(q));
  }, [accounts, query]);

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
          placeholder="Search company name..."
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
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Industry</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 font-medium">Contacts</th>
                  <th className="px-4 py-3 font-medium">Deals</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
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
