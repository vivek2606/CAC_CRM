"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { resyncCategoryData } from "../deals/actions";

export function ResyncCategoryButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ checked: number; repaired: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setResult(null);
    setError(null);
    startTransition(async () => {
      try {
        const outcome = await resyncCategoryData();
        setResult(outcome);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not resync category data.");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-xs font-medium px-3 py-1.5 transition-colors"
        title="If a recently-won deal isn't showing up here yet, click this to recompute category data for every won deal."
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Resyncing..." : "Not seeing a recent win? Resync category data"}
      </button>
      {result && !isPending && (
        <span className="text-xs text-emerald-600">
          Checked {result.checked} won deal{result.checked === 1 ? "" : "s"}
          {result.repaired > 0 ? ` - repaired ${result.repaired}.` : " - already up to date."}
        </span>
      )}
      {error && !isPending && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
