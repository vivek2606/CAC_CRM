"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fixConversionDates } from "./actions";

export function FixConversionButton({ count }: { count: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Set the conversion date of ${count} deal${count === 1 ? "" : "s"} converted after closing to 3 days before the invoice date?`)) return;
          start(async () => {
            const res = await fixConversionDates();
            setMsg(res.error ?? `Done - ${res.moved} deal${res.moved === 1 ? "" : "s"} corrected.`);
            router.refresh();
          });
        }}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "Fixing…" : "Fix all - 3 days before the invoice date"}
      </button>
      {msg && <span className="text-sm text-emerald-700">{msg}</span>}
    </span>
  );
}
