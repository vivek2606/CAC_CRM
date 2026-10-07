"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { ExportCsvButton } from "@/components/export-csv-button";
import { formatCurrency, formatDate } from "@/lib/format";
import type { WinBackRow } from "@/lib/win-back";

type Key = "name" | "code" | "owner" | "lastSoldBy" | "lastPurchase" | "monthsSince" | "orders" | "value24m" | "lifetimeValue" | "lastProducts";
const COLS: { key: Key; label: string; numeric?: boolean; backOffice?: boolean }[] = [
  { key: "name", label: "Account" },
  { key: "code", label: "Code" },
  { key: "owner", label: "Account owner", backOffice: true },
  { key: "lastSoldBy", label: "Last sold by" },
  { key: "lastPurchase", label: "Last purchase" },
  { key: "monthsSince", label: "Months since", numeric: true },
  { key: "orders", label: "Orders", numeric: true },
  { key: "value24m", label: "Value, last 24 months", numeric: true },
  { key: "lifetimeValue", label: "Lifetime value", numeric: true },
  { key: "lastProducts", label: "Bought last" },
];

export function WinBackTable({ rows, showOwner }: { rows: WinBackRow[]; showOwner: boolean }) {
  const cols = COLS.filter((c) => showOwner || !c.backOffice);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<Key>("lifetimeValue");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? rows.filter((r) => cols.some((c) => String(r[c.key] ?? "").toLowerCase().includes(s))) : [...rows];
    const m = dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const x = a[sortKey] ?? "";
      const y = b[sortKey] ?? "";
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * m;
    });
  }, [rows, q, sortKey, dir, cols]);

  const sortBy = (k: Key) => {
    if (k === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setDir(COLS.find((c) => c.key === k)?.numeric ? "desc" : "asc");
    }
  };
  const total = visible.reduce((t, r) => t + r.value24m, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search account, product, sales person…"
          className="w-72 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{visible.length}</span> customer{visible.length === 1 ? "" : "s"} · bought{" "}
          <span className="font-semibold text-slate-900">{formatCurrency(total)}</span> in the last 24 months
        </p>
        <div className="ml-auto">
          <ExportCsvButton
            filename="win-back-list.csv"
            headers={cols.map((c) => c.label)}
            rows={visible.map((r) => cols.map((c) => r[c.key] ?? ""))}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
              {cols.map((c) => (
                <th key={c.key} className={`px-2 py-2 font-medium whitespace-nowrap ${c.numeric ? "text-right" : ""}`}>
                  <button type="button" onClick={() => sortBy(c.key)} className="inline-flex items-center gap-1 hover:text-slate-800">
                    {c.label}
                    {sortKey === c.key ? dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="px-3 py-10 text-center text-sm text-slate-500">
                  No customers to win back for this period - everyone has bought recently.
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.accountId} className="hover:bg-slate-50 text-slate-700">
                {cols.map((c) => (
                  <td key={c.key} className={`px-2 py-1.5 ${c.numeric ? "text-right tabular-nums whitespace-nowrap" : ""} ${c.key === "lastProducts" ? "max-w-[260px] truncate" : "whitespace-nowrap"}`} title={c.key === "lastProducts" ? r.lastProducts : undefined}>
                    {c.key === "name" ? (
                      <Link href={`/accounts/${r.accountId}`} className="font-medium text-indigo-700 hover:underline">
                        {r.name}
                      </Link>
                    ) : c.key === "lastPurchase" ? (
                      formatDate(new Date(`${r.lastPurchase}T00:00:00Z`))
                    ) : c.key === "value24m" || c.key === "lifetimeValue" ? (
                      formatCurrency(r[c.key])
                    ) : (
                      String(r[c.key] ?? "")
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
