"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDealConsiderForReorder } from "./actions";

// Shown on a Negotiation-stage deal: lets the sales person mark its units
// as demand for the next Midea factory order when they aren't in stock.
export function ReorderFlag({
  dealId,
  checked,
  itemCount,
  unitCount,
}: {
  dealId: string;
  checked: boolean;
  itemCount: number;
  unitCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const disabled = isPending || (itemCount === 0 && !checked);

  return (
    <div>
      <label className={`flex items-start gap-2 text-sm ${disabled && !isPending ? "text-slate-400" : "text-slate-700"}`}>
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
          checked={checked}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.checked;
            setError(null);
            startTransition(async () => {
              try {
                await setDealConsiderForReorder(dealId, next);
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not update this deal.");
              }
            });
          }}
        />
        <span>
          <span className="font-medium">Consider these units for the next Midea order if not in stock</span>
          <span className="block text-xs text-slate-500">
            {itemCount === 0
              ? "Add the deal's products below first - the units come from its line items."
              : `${unitCount} unit${unitCount === 1 ? "" : "s"} across ${itemCount} item${itemCount === 1 ? "" : "s"} will show in the reorder report while this deal is in Negotiation.`}
          </span>
        </span>
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
