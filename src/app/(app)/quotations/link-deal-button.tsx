"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/searchable-select";
import { dealOptionsForQuote, linkQuotationDeal } from "./actions";

// "Link deal" on a quotation saved without one: pick from the sales
// person's deals.
export function LinkDealButton({ quoteId, quoteRef, ownerName }: { quoteId: string; quoteRef: string; ownerName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deals, setDeals] = useState<{ id: string; label: string }[] | null>(null);
  const [dealId, setDealId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const show = () => {
    setOpen(true);
    setError(null);
    if (!deals) start(async () => setDeals(await dealOptionsForQuote(quoteId)));
  };
  const save = () => {
    if (!dealId) return setError("Pick the deal.");
    start(async () => {
      const res = await linkQuotationDeal(quoteId, dealId);
      if (res.error) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button type="button" onClick={show} className="text-amber-700 hover:text-amber-600 font-medium">
        Link deal
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 text-left" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl whitespace-normal" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-900">Link {quoteRef} to a deal</h2>
            <p className="mt-1 mb-4 text-xs text-slate-500">{ownerName}&apos;s deals. The quotation then shows on the deal&apos;s page.</p>
            {deals == null ? (
              <p className="text-sm text-slate-500">Loading deals…</p>
            ) : deals.length === 0 ? (
              <p className="text-sm text-slate-500">{ownerName} has no deals yet. Create the deal first, then link this quotation to it.</p>
            ) : (
              <SearchableSelect options={deals} value={dealId} onSelect={(o) => setDealId(o?.id ?? "")} placeholder="Type to search deals…" />
            )}
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3.5 py-2 text-sm text-slate-600 hover:text-slate-900">
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || !deals?.length}
                onClick={save}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-3.5 py-2"
              >
                {pending && deals ? "Linking…" : "Link deal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
