import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  basePath,
  searchParams = {},
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value) params.set(key, value);
    }
    params.set("page", String(targetPage));
    return `${basePath}?${params.toString()}`;
  };

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm">
      <p className="text-slate-500">
        Showing {start}–{end} of {totalCount}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={buildHref(Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={`inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-600 ${
            page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"
          }`}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </Link>
        <span className="text-slate-500 px-1">
          Page {page} of {totalPages}
        </span>
        <Link
          href={buildHref(Math.min(totalPages, page + 1))}
          aria-disabled={page >= totalPages}
          className={`inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-600 ${
            page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-slate-50"
          }`}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

export function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
