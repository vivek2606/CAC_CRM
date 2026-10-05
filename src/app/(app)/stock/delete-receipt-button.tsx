"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteStockReceipt } from "./actions";

export function DeleteReceiptButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Remove this stock receipt? Its units will no longer count toward stock.")) return;
        startTransition(async () => {
          await deleteStockReceipt(id);
          router.refresh();
        });
      }}
      className="text-xs font-medium text-slate-400 hover:text-rose-600 disabled:opacity-50"
    >
      Remove
    </button>
  );
}
