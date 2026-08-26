"use client";

import { useActionState } from "react";
import { bulkConvertLeadsByProbability, type BulkConvertState } from "./actions";
import { formatCompactCurrency } from "@/lib/format";
import { ArrowRightLeft } from "lucide-react";

const initialState: BulkConvertState = {};

export function BulkConvertButton() {
  const [state, formAction, isPending] = useActionState(bulkConvertLeadsByProbability, initialState);

  return (
    <div className="text-right">
      <form
        action={formAction}
        onSubmit={(e) => {
          if (
            !window.confirm(
              "Convert every open Hot/Warm/Cold lead to a Deal?\n\nHot → Negotiation, Warm → Proposal, Cold → Needs Analysis.\n\nAlready-converted or Lost leads are left alone. This can't be bulk-undone."
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
        >
          <ArrowRightLeft className="h-4 w-4" />
          {isPending ? "Converting…" : "Convert Hot/Warm/Cold to Deals"}
        </button>
      </form>

      {state.summary && (
        <p className="text-xs text-slate-500 mt-1.5 max-w-xs ml-auto">
          Converted {state.summary.converted} leads — {state.summary.negotiation} to Negotiation,{" "}
          {state.summary.proposal} to Proposal, {state.summary.needsAnalysis} to Needs Analysis (
          {formatCompactCurrency(state.summary.totalValue)} total).
        </p>
      )}
      {state.error && <p className="text-xs text-red-600 mt-1.5">{state.error}</p>}
    </div>
  );
}
