"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideQuoteDiscount } from "./actions";

export function DecideButtons({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      setError(null);
      const res = await decideQuoteDiscount(quoteId, approve);
      if (res.error) setError(res.error);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => decide(true)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
        Approve as is
      </button>
      <button type="button" disabled={pending} onClick={() => decide(false)} className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50">
        Decline
      </button>
      {pending && <span className="text-xs text-slate-400">Saving…</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
