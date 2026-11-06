"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import { setDealDelivered } from "./closing-actions";

// The won order from invoice to installed: what's done and what's left.
export type ChecklistStep = { key: string; label: string; state: "done" | "todo" | "na"; detail: string; href?: string };

export function ClosingChecklist({ dealId, steps, delivered, today }: { dealId: string; steps: ChecklistStep[]; delivered: boolean; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const relevant = steps.filter((s) => s.state !== "na");
  const doneCount = relevant.filter((s) => s.state === "done").length;
  const run = (input: { date: string; ref: string } | null) =>
    start(async () => {
      setError("");
      const res = await setDealDelivered(dealId, input);
      if (res.error) return setError(res.error);
      setOpen(false);
      router.refresh();
    });

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Order checklist</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${doneCount === relevant.length ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {doneCount} of {relevant.length} done
        </span>
      </div>
      <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-2 text-sm">
            {s.state === "done" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Done" />
            ) : s.state === "na" ? (
              <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-label="Not needed" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-label="To do" />
            )}
            <span>
              <span className={s.state === "na" ? "text-slate-400" : "font-medium text-slate-800"}>{s.label}</span>
              <span className="text-slate-500">
                {" "}
                - {s.href ? (
                  <Link href={s.href} className="text-indigo-600 hover:text-indigo-700">
                    {s.detail}
                  </Link>
                ) : (
                  s.detail
                )}
              </span>
              {s.key === "delivered" && !open && (
                <button type="button" onClick={() => (delivered ? run(null) : setOpen(true))} disabled={pending} className="ml-2 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                  {delivered ? "Undo" : "Mark delivered"}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {open && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Delivered on</span>
            <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Waybill / delivery note no.</span>
            <input value={ref} onChange={(e) => setRef(e.target.value)} className="w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          </label>
          <button type="button" onClick={() => run({ date, ref })} disabled={pending} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
            Save
          </button>
          <button type="button" onClick={() => setOpen(false)} className="px-2 py-1.5 text-sm text-slate-600">
            Cancel
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
