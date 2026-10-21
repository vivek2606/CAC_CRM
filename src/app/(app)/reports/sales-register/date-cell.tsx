"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWonOrderDate } from "../../deals/actions";

// Head only: the invoice date of a won order, changed in place - for a
// deal it moves the whole order (all its lines), for a Project & Service
// line just that line.
export function DateCell({ date, label, dealId, billingId }: { date: string; label: string; dealId?: string; billingId?: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-900" title="Change the date of this won order">
        {pending ? "Saving…" : label}
      </button>
    );
  }
  return (
    <input
      type="date"
      autoFocus
      defaultValue={date}
      max={today}
      disabled={pending}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
      onChange={(e) => {
        const v = e.target.value;
        if (!v || v === date) return;
        const what = dealId ? "This moves the whole order (every line of it) to" : "Move this billing line to";
        if (!window.confirm(`${what} ${v.split("-").reverse().join("/")}?`)) return;
        setEditing(false);
        start(async () => {
          const res = await setWonOrderDate({ dealId, billingId }, v);
          if (res.error) window.alert(res.error);
          router.refresh();
        });
      }}
      className="rounded border border-slate-300 px-1 py-0.5 text-[11px]"
    />
  );
}
