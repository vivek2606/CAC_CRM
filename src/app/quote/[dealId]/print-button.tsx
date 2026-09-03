"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

export function PrintButton({ dealId }: { dealId: string }) {
  return (
    <div className="flex items-center justify-between mb-3 print:hidden">
      <Link href={`/deals/${dealId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        Back to deal
      </Link>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 transition-colors"
      >
        <Printer className="h-4 w-4" />
        Print / Save as PDF
      </button>
    </div>
  );
}
