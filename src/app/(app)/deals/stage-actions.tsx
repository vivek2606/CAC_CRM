"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { updateDealStage } from "./actions";
import type { DealStage } from "@prisma/client";

export function StageActions({ dealId, stage }: { dealId: string; stage: DealStage }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (stage === "WON" || stage === "LOST") return null;

  function markWon() {
    startTransition(async () => {
      await updateDealStage(dealId, "WON");
      router.refresh();
    });
  }

  function markLost() {
    const reason = window.prompt("Reason for losing this deal?") ?? "Not specified";
    startTransition(async () => {
      await updateDealStage(dealId, "LOST", reason);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={markWon}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-medium px-3.5 py-2 transition-colors"
      >
        <CheckCircle2 className="h-4 w-4" />
        Mark Won
      </button>
      <button
        onClick={markLost}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-sm font-medium px-3.5 py-2 transition-colors"
      >
        <XCircle className="h-4 w-4" />
        Mark Lost
      </button>
    </div>
  );
}
