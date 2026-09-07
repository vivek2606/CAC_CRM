"use client";

import { useState } from "react";

export function MarkWonDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (closedAt: string) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [closedAt, setClosedAt] = useState(today);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Mark this deal Won</h2>
        <p className="text-xs text-slate-500 mb-4">Feeds Won-this-month totals and target achievement.</p>

        <label className="block text-xs font-medium text-slate-500 mb-1">Date won</label>
        <input
          type="date"
          value={closedAt}
          max={today}
          onChange={(e) => setClosedAt(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

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
            onClick={() => onConfirm(closedAt)}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-3.5 py-2 transition-colors"
          >
            Mark Won
          </button>
        </div>
      </div>
    </div>
  );
}
