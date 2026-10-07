"use client";

import { useState } from "react";

// Marking a deal Won asks for the invoice: its date (also the date the
// deal counts as won for targets and incentives) and its number.
export function MarkWonDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (closedAt: string, invoiceNo: string) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [closedAt, setClosedAt] = useState(today);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    if (!invoiceNo.trim()) return setError("Enter the invoice no.");
    if (!closedAt) return setError("Enter the invoice date.");
    onConfirm(closedAt, invoiceNo.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Mark this deal Won</h2>
        <p className="text-xs text-slate-500 mb-4">Enter the invoice raised for this deal. The invoice date is the date the sale counts toward targets and incentives.</p>

        <label className="block text-xs font-medium text-slate-500 mb-1">Invoice no. *</label>
        <input
          value={invoiceNo}
          onChange={(e) => {
            setInvoiceNo(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && confirm()}
          placeholder="e.g. 2026091005"
          autoFocus
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <label className="block text-xs font-medium text-slate-500 mb-1">Invoice date *</label>
        <input
          type="date"
          value={closedAt}
          max={today}
          onChange={(e) => {
            setClosedAt(e.target.value);
            setError(null);
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {error && <p className="-mt-1 mb-3 text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-3.5 py-2 transition-colors"
          >
            Mark Won
          </button>
        </div>
      </div>
    </div>
  );
}
