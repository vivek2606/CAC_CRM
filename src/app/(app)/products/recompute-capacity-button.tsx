"use client";

import { useActionState } from "react";
import { recomputeCapacities, type RecomputeCapacityState } from "./actions";
import { RefreshCw } from "lucide-react";

const initialState: RecomputeCapacityState = {};

export function RecomputeCapacityButton() {
  const [state, formAction, isPending] = useActionState(async () => recomputeCapacities(), initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
      >
        <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Recomputing…" : "Recompute Capacity (kW)"}
      </button>
      {state.summary && (
        <span className="text-xs text-slate-500">
          {state.summary.updated} updated, {state.summary.unchanged} already correct, {state.summary.noMatch} skipped
          (no capacity code found)
        </span>
      )}
    </form>
  );
}
