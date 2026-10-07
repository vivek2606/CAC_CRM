"use client";

import { useState, useTransition } from "react";
import { setDealInvoice } from "./actions";

// Inline "add the invoice" form for a deal won in the CRM without one.
export function InvoiceEntry({ dealId, closedAt, compact = false }: { dealId: string; closedAt: string; compact?: boolean }) {
  const [no, setNo] = useState("");
  const [date, setDate] = useState(closedAt);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      setError(null);
      try {
        await setDealInvoice(dealId, no, date);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  if (saved) return <span className="text-xs font-medium text-emerald-700">Saved</span>;
  const box = `rounded-lg border border-slate-300 bg-white px-2.5 ${compact ? "py-1 text-xs" : "py-1.5 text-sm"} focus:outline-none focus:ring-2 focus:ring-indigo-500`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input value={no} onChange={(e) => setNo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Invoice no." aria-label="Invoice no." className={`${box} w-36`} />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Invoice date" className={box} />
      <button
        type="button"
        disabled={pending || !no.trim()}
        onClick={save}
        className={`rounded-lg bg-emerald-600 font-medium text-white hover:bg-emerald-500 disabled:opacity-50 ${compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"}`}
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
