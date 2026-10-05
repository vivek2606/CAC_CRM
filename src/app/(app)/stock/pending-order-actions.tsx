"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPendingOrderPaid, setPendingOrderStatus } from "./actions";

const btn = "text-xs font-medium disabled:opacity-50";

export function PendingOrderActions({
  id,
  status,
  paymentReceived,
}: {
  id: string;
  status: "OPEN" | "FULFILLED" | "CANCELLED";
  paymentReceived: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  if (status !== "OPEN") {
    return (
      <button type="button" disabled={isPending} onClick={() => run(() => setPendingOrderStatus(id, "OPEN"))} className={`${btn} text-slate-500 hover:text-slate-700`}>
        Reopen
      </button>
    );
  }
  return (
    <div className="flex gap-3 whitespace-nowrap">
      <button type="button" disabled={isPending} onClick={() => run(() => setPendingOrderPaid(id, !paymentReceived))} className={`${btn} text-indigo-600 hover:text-indigo-700`}>
        {paymentReceived ? "Mark unpaid" : "Mark paid"}
      </button>
      <button type="button" disabled={isPending} onClick={() => run(() => setPendingOrderStatus(id, "FULFILLED"))} className={`${btn} text-emerald-600 hover:text-emerald-700`}>
        Delivered
      </button>
      <button type="button" disabled={isPending} onClick={() => run(() => setPendingOrderStatus(id, "CANCELLED"))} className={`${btn} text-rose-600 hover:text-rose-700`}>
        Cancel
      </button>
    </div>
  );
}
