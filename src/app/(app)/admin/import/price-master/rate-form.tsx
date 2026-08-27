"use client";

import { useActionState } from "react";
import { setExchangeRate, type RateState } from "./actions";

const initialState: RateState = {};

export function RateForm() {
  const [state, formAction, isPending] = useActionState(setExchangeRate, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
        <input
          type="month"
          name="month"
          required
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">₦ per $1</label>
        <input
          type="number"
          name="rate"
          step="0.01"
          min="0"
          required
          placeholder="e.g. 1550"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors"
      >
        {isPending ? "Saving…" : "Save Rate"}
      </button>
      {state.success && <span className="text-sm text-emerald-600">Saved.</span>}
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  );
}
