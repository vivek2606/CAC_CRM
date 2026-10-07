"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { updateDealStage, markDealWon } from "./actions";
import { MarkLostDialog } from "./mark-lost-dialog";
import { MarkWonDialog, type WonExistingItem, type WonNewItem, type WonProductOption } from "./mark-won-dialog";
import type { DealStage, LostReason } from "@prisma/client";

export function StageActions({
  dealId,
  stage,
  blockWonReason,
  existingItems,
  products,
  openWon = false,
}: {
  dealId: string;
  stage: DealStage;
  existingItems: WonExistingItem[];
  products: WonProductOption[];
  // Open the Mark Won dialog straight away (e.g. after dropping the deal on
  // Won in the Pipeline board).
  openWon?: boolean;
  // Set when this deal can't be marked Won yet (e.g. an unapproved
  // discount) - disables the button and shows why, instead of letting the
  // click round-trip to the server just to fail.
  blockWonReason?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [showLostDialog, setShowLostDialog] = useState(false);
  const [showWonDialog, setShowWonDialog] = useState(openWon && !blockWonReason);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (stage === "WON" || stage === "LOST") return null;

  function markWon(closedAt: string, invoiceNo: string, newItems: WonNewItem[]) {
    setShowWonDialog(false);
    setError(null);
    startTransition(async () => {
      try {
        await markDealWon(dealId, closedAt, invoiceNo, newItems);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not mark this deal Won.");
      }
    });
  }

  function markLost(category: LostReason, note: string, closedAt: string) {
    setShowLostDialog(false);
    setError(null);
    startTransition(async () => {
      try {
        await updateDealStage(dealId, "LOST", category, note || undefined, closedAt);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not mark this deal Lost.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowWonDialog(true)}
          disabled={isPending || !!blockWonReason}
          title={blockWonReason ?? undefined}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:hover:bg-emerald-600 text-white text-sm font-medium px-3.5 py-2 transition-colors"
        >
          <CheckCircle2 className="h-4 w-4" />
          Mark Won
        </button>
        <button
          onClick={() => setShowLostDialog(true)}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-sm font-medium px-3.5 py-2 transition-colors"
        >
          <XCircle className="h-4 w-4" />
          Mark Lost
        </button>
        {showLostDialog && <MarkLostDialog onConfirm={markLost} onCancel={() => setShowLostDialog(false)} />}
        {showWonDialog && (
          <MarkWonDialog existingItems={existingItems} products={products} onConfirm={markWon} onCancel={() => setShowWonDialog(false)} />
        )}
      </div>
      {(blockWonReason || error) && (
        <p className="text-xs text-amber-600 max-w-xs text-right">{error ?? blockWonReason}</p>
      )}
    </div>
  );
}
