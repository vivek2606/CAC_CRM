"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STANDARD_KEYS, STANDARD_LABEL, type Standards } from "@/lib/activity-standards-constants";
import { saveActivityStandards } from "./actions";

// The Head's weekly minimums for each sales person.
export function StandardsForm({ standards }: { standards: Standards }) {
  const router = useRouter();
  const [v, setV] = useState(standards);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-3">
      {STANDARD_KEYS.map((k) => (
        <label key={k} className="text-xs font-medium text-slate-500">
          <span className="mb-1 block">{STANDARD_LABEL[k]}</span>
          <input
            type="number"
            min={0}
            value={v[k]}
            onChange={(e) => setV({ ...v, [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm"
          />
        </label>
      ))}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await saveActivityStandards(v);
            setMsg(res.error ?? "Saved.");
            router.refresh();
          })
        }
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        Save minimums
      </button>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
    </div>
  );
}
