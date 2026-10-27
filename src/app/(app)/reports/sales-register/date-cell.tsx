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
  const [value, setValue] = useState(date);
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(date);
          setEditing(true);
        }}
        className="text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-900"
        title="Change the date of this won order"
      >
        {pending ? "Saving…" : label}
      </button>
    );
  }
  // Typed or picked freely; nothing is saved until Save (or Enter).
  const save = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return window.alert("Enter the full date.");
    if (value > today) return window.alert("The date can't be in the future.");
    if (value === date) return setEditing(false);
    const what = dealId ? "This moves the whole order (every line of it) to" : "Move this billing line to";
    if (!window.confirm(`${what} ${value.split("-").reverse().join("/")}?`)) return;
    setEditing(false);
    start(async () => {
      const res = await setWonOrderDate({ dealId, billingId }, value);
      if (res.error) window.alert(res.error);
      router.refresh();
    });
  };
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <input
        type="date"
        autoFocus
        value={value}
        max={today}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="rounded border border-slate-300 px-1 py-0.5 text-[11px]"
      />
      <button type="button" onClick={save} className="rounded bg-indigo-600 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-indigo-500">
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className="px-1 text-[11px] text-slate-500 hover:text-slate-800">
        Cancel
      </button>
    </span>
  );
}
