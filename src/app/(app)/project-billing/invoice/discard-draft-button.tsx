"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { discardServiceInvoiceDraft } from "./actions";

export function DiscardInvoiceDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Discard this draft? It can't be brought back.")) return;
        start(async () => {
          const res = await discardServiceInvoiceDraft(id);
          if (res.error) window.alert(res.error);
          router.refresh();
        });
      }}
      className="text-sm text-rose-600 hover:text-rose-700 disabled:opacity-50"
    >
      {pending ? "Discarding…" : "Discard"}
    </button>
  );
}
