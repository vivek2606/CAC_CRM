"use client";

import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

// A clickable <th> for client-side table sorting - toggles asc/desc on the
// same column, switches to asc on a newly clicked one. Kept as a plain
// column-header button (not a full sort-state manager) so each table owns
// its own sort state and just wires this up per column.
export function SortableTh<K extends string>({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: K;
  activeKey: K | null;
  direction: "asc" | "desc";
  onSort: (key: K) => void;
  className?: string;
}) {
  const isActive = activeKey === sortKey;
  return (
    <th className={`px-4 py-3 font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-slate-600 transition-colors ${
          isActive ? "text-slate-600" : ""
        }`}
      >
        {label}
        {isActive ? (
          direction === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}
