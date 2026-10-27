"use client";

import { useState } from "react";
import { LOST_REASONS, LOST_REASON_LABELS } from "@/lib/constants";
import type { LostReason } from "@prisma/client";
import { CompetitorBrandSelect } from "@/components/competitor-brand-select";

export type LostInput = { category: LostReason; note: string; lostToBrand: string; closedAt: string };

// Why the deal was lost (one of the fixed reasons, for the "why we lose"
// report), a brief note, and the brand the customer bought instead.
export function MarkLostDialog({
  onConfirm,
  onCancel,
  competitorBrand,
}: {
  onConfirm: (input: LostInput) => void;
  onCancel: () => void;
  // The competing brand recorded on the deal, if any - suggested as the winner.
  competitorBrand?: string | null;
}) {
  const [category, setCategory] = useState<LostReason | "">("");
  const [note, setNote] = useState("");
  const [brand, setBrand] = useState(competitorBrand ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const [closedAt, setClosedAt] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  const confirm = () => {
    if (!category) return setError("Pick the reason the deal was lost.");
    if (category === "OTHER" && !note.trim()) return setError("Write the reason in the box below.");
    if (category === "COMPETITOR" && !brand.trim()) return setError("Pick the brand the customer preferred.");
    onConfirm({ category, note: note.trim(), lostToBrand: brand.trim(), closedAt });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Why was this deal lost?</h2>
        <p className="text-xs text-slate-500 mb-4">This feeds the &quot;why we lose&quot; report for the team.</p>

        <p className="block text-xs font-medium text-slate-500 mb-1.5">Reason *</p>
        <div className="space-y-1 mb-3">
          {LOST_REASONS.map((r, i) => (
            <label
              key={r}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                category === r ? "border-rose-300 bg-rose-50 text-rose-900" : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="lost-reason"
                checked={category === r}
                onChange={() => {
                  setCategory(r);
                  setError(null);
                }}
                className="h-4 w-4"
              />
              <span className="text-slate-400 w-4">{String.fromCharCode(97 + i)}.</span>
              {LOST_REASON_LABELS[r]}
              {r === "OTHER" && <span className="text-xs text-slate-400">(please mention)</span>}
            </label>
          ))}
        </div>

        <label className="block text-xs font-medium text-slate-500 mb-1">Brief reason{category === "OTHER" ? " *" : ""}</label>
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setError(null);
          }}
          rows={2}
          placeholder="What happened, in a line or two"
          className={`${input} mb-3`}
        />

        <label className="block text-xs font-medium text-slate-500 mb-1">Brand that won the deal{category === "COMPETITOR" ? " *" : ""}</label>
        <CompetitorBrandSelect
          value={brand}
          onChange={(b) => {
            setBrand(b);
            setError(null);
          }}
          placeholder="Not known"
          className={`${input} mb-3`}
        />

        <label className="block text-xs font-medium text-slate-500 mb-1">Date lost</label>
        <input type="date" value={closedAt} max={today} onChange={(e) => setClosedAt(e.target.value)} className={`${input} mb-4`} />

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
          >
            Cancel
          </button>
          <button type="button" onClick={confirm} className="rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium px-3.5 py-2 transition-colors">
            Mark Lost
          </button>
        </div>
      </div>
    </div>
  );
}
