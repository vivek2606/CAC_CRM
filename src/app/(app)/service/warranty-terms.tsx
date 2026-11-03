"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { setDealWarranty } from "./actions";

// A won sale's warranty: standard 12 months from the invoice, or other terms.
export function WarrantyTerms({ dealId, months, until }: { dealId: string; months: number | null; until: string | null }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [value, setValue] = useState(String(months ?? 12));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
      <ShieldCheck className="h-4 w-4 text-emerald-600" />
      <span>
        Warranty: <b>{months ?? 12} months</b> {months == null ? "(standard)" : "(special terms)"}
        {until ? ` - until ${until}` : ""}
      </span>
      {edit ? (
        <>
          <input type="number" min={0} max={120} value={value} onChange={(e) => setValue(e.target.value)} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
          <span className="text-xs text-slate-500">months</span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await setDealWarranty(dealId, Number(value));
                if (res.error) return setError(res.error);
                setEdit(false);
                router.refresh();
              })
            }
            className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white"
          >
            Save
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setEdit(true)} className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
          Change
        </button>
      )}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
