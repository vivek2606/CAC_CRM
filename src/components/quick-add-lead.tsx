"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import { quickAddLead, quickAddOwners } from "@/app/(app)/leads/actions";
import { ExistingCustomerHint } from "@/components/existing-customer-hint";
import { phoneLooksWrong } from "@/lib/phone";

// "+ Lead" in the top bar: a lead in three fields while on the phone -
// who, their number, what they need. The rest is filled in later.
export function QuickAddLeadButton({ backOffice }: { backOffice: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", phone: "", need: "", ownerId: "" });
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (open && backOffice && owners.length === 0) quickAddOwners().then(setOwners).catch(() => {});
  }, [open, backOffice, owners.length]);
  const close = () => {
    setOpen(false);
    setError("");
    setDone(null);
  };
  const save = () =>
    start(async () => {
      setError("");
      const res = await quickAddLead(v);
      if (res.error) return setError(res.error);
      setDone(res.id!);
      setV({ name: "", phone: "", need: "", ownerId: v.ownerId });
      router.refresh();
    });
  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Quick add a lead"
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
      >
        <UserPlus className="h-4 w-4" />
        <span className="hidden sm:inline">Lead</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-20" onClick={close}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center">
              <h2 className="text-sm font-semibold text-slate-900">Quick add a lead</h2>
              <button type="button" onClick={close} className="ml-auto text-slate-400 hover:text-slate-700" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            {done ? (
              <div className="space-y-3 text-sm">
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">Lead added. Fill in the rest (value, equipment, source) when you can - the bell will remind you.</p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setDone(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50">
                    Add another
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      router.push(`/leads/${done}`);
                    }}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500"
                  >
                    Open the lead
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs text-slate-500">
                  <span className="mb-1 block">Customer / company *</span>
                  <input autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className={field} />
                </label>
                <label className="block text-xs text-slate-500">
                  <span className="mb-1 block">Phone no.{backOffice ? "" : " *"}</span>
                  <input inputMode="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="0803 123 4567" className={field} />
                  {phoneLooksWrong(v.phone) && <span className="mt-1 block text-amber-700">Check the number - Nigerian mobiles have 11 digits (0803...).</span>}
                </label>
                <label className="block text-xs text-slate-500">
                  <span className="mb-1 block">What do they need? *</span>
                  <input value={v.need} onChange={(e) => setV({ ...v, need: e.target.value })} placeholder="e.g. 4 x 2HP splits for an office in Lekki" className={field} />
                </label>
                {backOffice && (
                  <label className="block text-xs text-slate-500">
                    <span className="mb-1 block">For</span>
                    <select value={v.ownerId} onChange={(e) => setV({ ...v, ownerId: e.target.value })} className={field}>
                      <option value="">Me</option>
                      {owners.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <ExistingCustomerHint phone={v.phone} name={v.name} />
                {error && <p className="text-sm text-rose-600">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">
                    Cancel
                  </button>
                  <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                    {pending ? "Saving..." : "Add lead"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
