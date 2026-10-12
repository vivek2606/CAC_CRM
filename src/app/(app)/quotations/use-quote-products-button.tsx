"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyQuoteToDeal } from "../deals/actions";

// On a deal's Quotations list: replace the deal's products with this
// quote's (product-list lines only - not installation or other custom lines).
export function UseQuoteProductsButton({ quoteId, hasProducts }: { quoteId: string; hasProducts: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (hasProducts && !window.confirm("Replace this deal's products with the ones on this quotation?")) return;
          start(async () => {
            const res = await applyQuoteToDeal(quoteId);
            setNote(res.error ?? null);
            if (!res.error) router.refresh();
          });
        }}
        className="font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
        title="Fill the deal's products, quantities and rates from this quotation"
      >
        {pending ? "Copying…" : "Use products"}
      </button>
      {note && <span className="ml-1 text-xs text-red-600">{note}</span>}
    </>
  );
}
