"use client";

import { useState, useTransition } from "react";
import { setDiscountReason } from "./approvals/actions";

// A quote held for the Head: tell the Head why the discount is needed (it
// goes into the approval log).
export function HeldReason({ quoteRef }: { quoteRef: string }) {
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is this discount needed? e.g. competitor quoted ₦X, project order"
        className="min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-2 py-1.5 text-sm text-slate-800"
      />
      <button
        type="button"
        disabled={pending || !reason.trim()}
        onClick={() =>
          start(async () => {
            const res = await setDiscountReason(quoteRef, reason);
            setMsg(res.error ?? "Sent to the Head with the quote.");
          })
        }
        className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
      >
        Send reason
      </button>
      {msg && <span className="text-xs">{msg}</span>}
    </div>
  );
}
