"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receiveInTransit, cancelInTransit, type FormState } from "./actions";

// Per-row controls for an in-transit line (Head only): receive all or part
// of it into stock on a given date, or cancel it.
export function InTransitActions({ id, quantity, today }: { id: string; quantity: number; today: string }) {
  const [open, setOpen] = useState(false);
  const [isCancelling, startCancel] = useTransition();
  const router = useRouter();
  const [state, action, isPending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await receiveInTransit(prev, formData);
    if (result.ok) {
      setOpen(false);
      router.refresh();
    }
    return result;
  }, {});

  if (!open) {
    return (
      <div className="flex gap-3 whitespace-nowrap">
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-emerald-600 hover:text-emerald-700">
          Receive
        </button>
        <button
          type="button"
          disabled={isCancelling}
          onClick={() => {
            if (!confirm("Cancel this in-transit line?")) return;
            startCancel(async () => {
              await cancelInTransit(id);
              router.refresh();
            });
          }}
          className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="quantity"
        type="number"
        min={1}
        max={quantity}
        defaultValue={quantity}
        className="w-20 rounded-md border border-slate-200 px-2 py-1 text-xs"
        aria-label="Quantity received"
      />
      <input name="receivedAt" type="date" defaultValue={today} className="rounded-md border border-slate-200 px-2 py-1 text-xs" aria-label="Date entered stock" />
      <button type="submit" disabled={isPending} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60">
        {isPending ? "…" : "Add to stock"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500">
        Close
      </button>
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
