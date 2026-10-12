"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { reopenDeal } from "./actions";

// Head / Coordinator: put a Won or Lost deal back in the pipeline.
export function ReopenDealButton({ dealId, stage }: { dealId: string; stage: "WON" | "LOST" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const what = stage === "WON" ? "its invoice no., date and Sales Register lines are cleared" : "its lost reason is cleared";
        if (!window.confirm(`Reopen this deal? It goes back to Negotiation and ${what}. Its products stay.`)) return;
        start(async () => {
          try {
            await reopenDeal(dealId);
            router.refresh();
          } catch (e) {
            alert(e instanceof Error ? e.message : "Couldn't reopen the deal.");
          }
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-sm font-medium px-3.5 py-2 transition-colors"
    >
      <RotateCcw className="h-4 w-4" />
      {pending ? "Reopening…" : "Reopen"}
    </button>
  );
}
