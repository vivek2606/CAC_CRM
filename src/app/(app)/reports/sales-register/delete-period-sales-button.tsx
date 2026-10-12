"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteCrmSalesInPeriod } from "../../deals/actions";

// Head only, on the Sales Register filtered to one sales person: clear the
// sales they entered in the CRM for the period, to enter them again.
export function DeletePeriodSalesButton({
  ownerId,
  ownerName,
  from,
  to,
  count,
  total,
}: {
  ownerId: string;
  ownerName: string;
  from: string;
  to: string;
  count: number;
  total: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const msg = `Delete all ${count} sale${count === 1 ? "" : "s"} ${ownerName} has entered in the CRM with an invoice date from ${fmt(from)} to ${fmt(to)} (${total})?\n\nThey come out of the Sales Register, targets and incentives. Sales imported from the ERP register are not touched. This can't be undone.`;
        if (!window.confirm(msg)) return;
        start(async () => {
          try {
            const res = await deleteCrmSalesInPeriod(ownerId, from, to);
            alert(`Deleted ${res.deleted} sale${res.deleted === 1 ? "" : "s"}.`);
            router.refresh();
          } catch (e) {
            alert(e instanceof Error ? e.message : "Couldn't delete.");
          }
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
    >
      <Trash2 className="h-4 w-4" />
      {pending ? "Deleting…" : `Delete ${ownerName}'s ${count} CRM sale${count === 1 ? "" : "s"} in this period`}
    </button>
  );
}
