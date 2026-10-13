"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteOrphanLinesInPeriod } from "../../deals/actions";

// Head only: remove register lines left with no deal (no account, company
// or link) for the period shown.
export function DeleteOrphanLinesButton({ ownerId, from, to, count, total }: { ownerId: string | null; from: string; to: string; count: number; total: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete ${count} Sales Register line${count === 1 ? "" : "s"} (${total}) with no deal behind ${count === 1 ? "it" : "them"} - no account, company or link? This can't be undone.`)) return;
        start(async () => {
          try {
            const res = await deleteOrphanLinesInPeriod(ownerId, from, to);
            if (res.error) return alert(res.error);
            alert(`Deleted ${res.deleted} line${res.deleted === 1 ? "" : "s"}.`);
            router.refresh();
          } catch (e) {
            alert(e instanceof Error ? e.message : "Couldn't delete.");
          }
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
    >
      <Trash2 className="h-4 w-4" />
      {pending ? "Deleting…" : `Delete ${count} line${count === 1 ? "" : "s"} with no deal`}
    </button>
  );
}
