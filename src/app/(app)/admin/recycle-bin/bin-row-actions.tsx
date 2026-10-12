"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreDeleted, deleteForever } from "./actions";

export function BinRowActions({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await restoreDeleted(id);
            if (res.error) alert(res.error);
            else if (res.href) router.push(res.href);
          })
        }
        className="font-medium text-indigo-700 hover:underline disabled:opacity-50"
      >
        {pending ? "Working…" : "Restore"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Delete "${label}" for good? It can't be restored after this.`)) return;
          start(async () => {
            await deleteForever(id);
            router.refresh();
          });
        }}
        className="text-slate-500 hover:text-red-600 disabled:opacity-50"
      >
        Delete forever
      </button>
    </span>
  );
}
