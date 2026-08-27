"use client";

import { useActionState } from "react";
import { setTarget, type SetTargetState } from "./actions";

const initialState: SetTargetState = {};

export function SetTargetForm({
  reps,
  month,
}: {
  reps: { id: string; name: string }[];
  month: string;
}) {
  const [state, formAction, isPending] = useActionState(setTarget, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Sales rep</label>
        <select
          name="userId"
          required
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <input type="hidden" name="month" value={month} />
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Target for {month}</label>
        <input
          type="number"
          name="targetValue"
          min="0"
          step="1000"
          required
          placeholder="e.g. 5000000"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors"
      >
        {isPending ? "Saving…" : "Set Target"}
      </button>
      {state.success && <span className="text-sm text-emerald-600">Saved.</span>}
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  );
}
