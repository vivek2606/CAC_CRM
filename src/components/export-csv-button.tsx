"use client";

import { Download } from "lucide-react";
import { toCsv } from "@/lib/csv";

export function ExportCsvButton({
  headers,
  rows,
  filename,
  label = "Export CSV",
}: {
  headers: string[];
  rows: (string | number)[][];
  filename: string;
  label?: string;
}) {
  function handleExport() {
    const csv = toCsv(headers, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleExport}
      disabled={rows.length === 0}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
    >
      <Download className="h-4 w-4" />
      {label}
    </button>
  );
}
