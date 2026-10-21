"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteQuotation } from "./actions";

// Head only: delete a saved quotation (it goes to the recycle bin for 30 days).
export function DeleteQuoteButton({ quoteId, quoteRef }: { quoteId: string; quoteRef: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title="Delete this quotation (kept in the Recycle Bin for 30 days)"
      onClick={() => {
        if (!window.confirm(`Delete quotation ${quoteRef}?\n\nIt stays in the Recycle Bin for 30 days, from where it can be restored.`)) return;
        start(async () => {
          const res = await deleteQuotation(quoteId);
          if (res.error) window.alert(res.error);
          router.refresh();
        });
      }}
      className="text-slate-400 hover:text-rose-600 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
      <span className="sr-only">Delete</span>
    </button>
  );
}
