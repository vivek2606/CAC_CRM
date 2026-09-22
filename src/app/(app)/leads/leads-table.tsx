"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRightLeft } from "lucide-react";
import { Badge, Avatar, EmptyState } from "@/components/ui";
import { TagChips } from "@/components/tag-chips";
import { SortableTh } from "@/components/sortable-th";
import { formatCurrency, formatDate } from "@/lib/format";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, LEAD_SOURCE_LABELS, LEAD_STATUSES } from "@/lib/constants";
import { bulkConvertSelectedLeads } from "./actions";
import type { LeadStatus, LeadSource } from "@prisma/client";

type SortKey = "title" | "status" | "value" | "owner" | "createdAt";
type SortDir = "asc" | "desc";

type LeadRow = {
  id: string;
  title: string;
  company: string | null;
  status: LeadStatus;
  source: LeadSource;
  value: number | null;
  createdAt: Date;
  owner: { id: string; name: string; avatarColor: string };
  tags: string[];
};

type Owner = { id: string; name: string };

// Filters entirely client-side as you type/select, no submit button - the
// server already loads every visible lead up front (no pagination existed
// here before either), so there's nothing to gain from a round-trip.
export function LeadsTable({ leads, owners, isHead }: { leads: LeadRow[]; owners: Owner[]; isHead: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = leads.filter(
      (l) =>
        (status === "" || l.status === status) &&
        (ownerId === "" || l.owner.id === ownerId) &&
        (q === "" ||
          l.title.toLowerCase().includes(q) ||
          (l.company ?? "").toLowerCase().includes(q) ||
          l.tags.some((t) => t.toLowerCase().includes(q)))
    );
    if (!sortKey) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "value":
          return ((a.value ?? 0) - (b.value ?? 0)) * dir;
        case "owner":
          return a.owner.name.localeCompare(b.owner.name) * dir;
        case "createdAt":
          return (a.createdAt.getTime() - b.createdAt.getTime()) * dir;
      }
    });
  }, [leads, query, status, ownerId, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function clear() {
    setQuery("");
    setStatus("");
    setOwnerId("");
  }

  // Already-converted leads have nothing left to convert - excluded from
  // selection entirely rather than just disabled, so "select all" doesn't
  // silently no-op on a filtered view full of them.
  const selectable = filtered.filter((l) => l.status !== "CONVERTED");
  const allSelected = selectable.length > 0 && selectable.every((l) => selected.has(l.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((l) => l.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function convertSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Convert ${ids.length} lead${ids.length === 1 ? "" : "s"} to Deal${ids.length === 1 ? "" : "s"}?`)) return;

    setMessage(null);
    startTransition(async () => {
      const result = await bulkConvertSelectedLeads(ids);
      if (result.error) {
        setMessage(result.error);
      } else if (result.summary) {
        setMessage(
          `Converted ${result.summary.converted} lead${result.summary.converted === 1 ? "" : "s"} to Deals` +
            (result.summary.skipped > 0 ? ` (${result.summary.skipped} skipped).` : ".")
        );
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-center px-4 py-3 border-b border-slate-100">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, company, or tag..."
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {isHead && (
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All sales managers</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        {(query || status || ownerId) && (
          <button type="button" onClick={clear} className="text-sm text-slate-500 hover:text-slate-700">
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 && (
        <EmptyState title="No leads found" description="Try adjusting your filters, or create a new lead." />
      )}

      {selected.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50 border-b border-indigo-100">
          <span className="text-sm text-indigo-700 font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(new Set())} className="text-sm text-indigo-600 hover:text-indigo-800">
              Clear
            </button>
            <button
              onClick={convertSelected}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium px-3.5 py-1.5 transition-colors"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {isPending ? "Converting…" : "Convert to Deal"}
            </button>
          </div>
        </div>
      )}
      {message && <p className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100">{message}</p>}

      {filtered.length > 0 && (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={selectable.length === 0}
                  aria-label="Select all leads"
                  className="rounded border-slate-300"
                />
              </th>
              <SortableTh label="Lead" sortKey="title" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
              <SortableTh label="Status" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 font-medium">Source</th>
              <SortableTh label="Value" sortKey="value" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
              <SortableTh label="Owner" sortKey="owner" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
              <SortableTh
                label="Created"
                sortKey="createdAt"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((lead) => {
              const colors = LEAD_STATUS_COLORS[lead.status];
              const isConverted = lead.status === "CONVERTED";
              return (
                <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                      disabled={isConverted}
                      aria-label={`Select ${lead.title}`}
                      className="rounded border-slate-300 disabled:opacity-30"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-800 hover:text-indigo-600">
                      {lead.title}
                    </Link>
                    {lead.company && <p className="text-xs text-slate-400">{lead.company}</p>}
                    <TagChips tags={lead.tags} className="mt-1" />
                  </td>
                  <td className="px-4 py-3">
                    <Badge bg={colors.bg} text={colors.text}>
                      {LEAD_STATUS_LABELS[lead.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{LEAD_SOURCE_LABELS[lead.source]}</td>
                  <td className="px-4 py-3 text-slate-700">{lead.value ? formatCurrency(lead.value) : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={lead.owner.name} color={lead.owner.avatarColor} size={6} />
                      <span className="text-slate-600">{lead.owner.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(lead.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
