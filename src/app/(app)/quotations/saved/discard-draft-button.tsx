"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { discardQuoteDraft } from "../actions";

export function DiscardDraftButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Discard the draft for ${label}? It can't be brought back.`)) return;
        start(async () => {
          const res = await discardQuoteDraft(id);
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
