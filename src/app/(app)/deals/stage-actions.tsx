"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ReceiptText, XCircle } from "lucide-react";
import { updateDealStage, markDealWon } from "./actions";
import { MarkLostDialog } from "./mark-lost-dialog";
import { LinkAccountDialog } from "./link-account-dialog";
import { MarkWonDialog, type WonExistingItem, type WonInvoiceInput, type WonProductOption } from "./mark-won-dialog";
import type { DealStage, LostReason } from "@prisma/client";

export function StageActions({
  dealId,
  stage,
  blockWonReason,
  existingItems,
  quotedValue,
  products,
  openWon = false,
  wonInvoice,
  needsAccount = false,
  accounts = [],
}: {
  dealId: string;
  stage: DealStage;
  existingItems: WonExistingItem[];
  quotedValue: number;
  products: WonProductOption[];
  // Open the Mark Won dialog straight away (e.g. after dropping the deal on
  // Won in the Pipeline board).
  openWon?: boolean;
  // Set when this deal can't be marked Won yet (e.g. an unapproved
  // discount) - disables the button and shows why, instead of letting the
  // click round-trip to the server just to fail.
  blockWonReason?: string | null;
  // A Won deal entered in the CRM: its invoice no. and date, so its invoices
  // and products can be recorded or split from here.
  wonInvoice?: { invoiceNo: string; closedAt: string };
  // No account linked yet: Mark Won first asks for one (pick or create).
  needsAccount?: boolean;
  accounts?: { id: string; label: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [showLostDialog, setShowLostDialog] = useState(false);
  const [showWonDialog, setShowWonDialog] = useState(openWon && !blockWonReason && !needsAccount);
  const [showLinkDialog, setShowLinkDialog] = useState(openWon && needsAccount);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (stage === "WON" && wonInvoice) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <button
          onClick={() => setShowWonDialog(true)}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 text-emerald-800 text-sm font-medium px-3.5 py-2 transition-colors"
        >
          <ReceiptText className="h-4 w-4" />
          {isPending ? "Saving…" : "Invoices & products"}
        </button>
        {showWonDialog && (
          <MarkWonDialog
            existingItems={existingItems}
            quotedValue={quotedValue}
            products={products}
            wonInvoice={wonInvoice}
            onConfirm={markWon}
            onCancel={() => setShowWonDialog(false)}
          />
        )}
        {error && <p className="text-xs text-red-600 max-w-xs text-right">{error}</p>}
      </div>
    );
  }
  if (stage === "WON" || stage === "LOST") return null;

  function markWon(invoices: WonInvoiceInput[]) {
    setShowWonDialog(false);
    setError(null);
    startTransition(async () => {
      try {
        await markDealWon(dealId, invoices);
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
          onClick={() => (needsAccount ? setShowLinkDialog(true) : setShowWonDialog(true))}
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
        {showWonDialog && !needsAccount && !blockWonReason && (
          <MarkWonDialog existingItems={existingItems} quotedValue={quotedValue} products={products} onConfirm={markWon} onCancel={() => setShowWonDialog(false)} />
        )}
        {showLinkDialog && (
          <LinkAccountDialog
            dealId={dealId}
            accounts={accounts}
            onCancel={() => setShowLinkDialog(false)}
            onLinked={() => {
              // Straight on to Mark Won once the page has the account.
              setShowLinkDialog(false);
              setShowWonDialog(true);
              router.refresh();
            }}
          />
        )}
      </div>
      {(blockWonReason || error) && (
        <p className="text-xs text-amber-600 max-w-xs text-right">{error ?? blockWonReason}</p>
      )}
      {needsAccount && !error && !blockWonReason && (
        <p className="text-xs text-slate-500 max-w-xs text-right">
          No account linked -{" "}
          <button type="button" onClick={() => setShowLinkDialog(true)} className="font-medium text-indigo-600 hover:text-indigo-700">
            link or create one
          </button>
        </p>
      )}
    </div>
  );
}
