"use client";

import { useState } from "react";
import { LOST_REASONS, LOST_REASON_LABELS } from "@/lib/constants";
import type { LostReason } from "@prisma/client";

export function MarkLostDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (category: LostReason, note: string) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<LostReason>("PRICE_TOO_HIGH");
  const [note, setNote] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Why was this deal lost?</h2>
        <p className="text-xs text-slate-500 mb-4">This feeds the &quot;why we lose&quot; report for the team.</p>

        <label className="block text-xs font-medium text-slate-500 mb-1">Reason</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as LostReason)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          autoFocus
        >
          {LOST_REASONS.map((r) => (
            <option key={r} value={r}>
              {LOST_REASON_LABELS[r]}
            </option>
          ))}
        </select>

        <label className="block text-xs font-medium text-slate-500 mb-1">Additional detail (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Anything specific worth remembering..."
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
            onClick={() => onConfirm(category, note.trim())}
            className="rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium px-3.5 py-2 transition-colors"
          >
            Mark Lost
          </button>
        </div>
      </div>
    </div>
  );
}
