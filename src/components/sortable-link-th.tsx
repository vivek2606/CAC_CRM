import Link from "next/link";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

// Server-rendered counterpart to SortableTh, for tables that paginate on the
// server (so sorting has to happen there too, via a URL param, rather than
// only re-ordering whatever page is currently loaded).
export function SortableLinkTh({
  label,
  sortKey,
  currentSort,
  currentDir,
  basePath,
  searchParams,
}: {
  label: string;
  sortKey: string;
  currentSort?: string;
  currentDir?: "asc" | "desc";
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  const isActive = currentSort === sortKey;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && k !== "page" && k !== "sort" && k !== "dir") params.set(k, v);
  }
  params.set("sort", sortKey);
  params.set("dir", nextDir);

  return (
    <th className="px-4 py-3 font-medium">
      <Link
        href={`${basePath}?${params.toString()}`}
        className={`inline-flex items-center gap-1 hover:text-slate-600 transition-colors ${
          isActive ? "text-slate-600" : ""
        }`}
      >
        {label}
        {isActive ? (
          currentDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </Link>
    </th>
  );
}
