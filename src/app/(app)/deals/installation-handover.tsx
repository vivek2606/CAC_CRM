"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { handOverInstallation } from "../service/installation-actions";

// Hands a won supply + installation order over to service: where, who to
// call, when the customer wants it, and anything the installer must know.
export function InstallationHandover({
  dealId,
  quoted,
  defaults,
}: {
  dealId: string;
  // The order was quoted with installation - prompt, open by default.
  quoted: boolean;
  defaults: { contactName: string; phone: string; siteAddress: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ ...defaults, preferredDate: "", notes: "" });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
  const save = () =>
    start(async () => {
      setError("");
      const res = await handOverInstallation(dealId, v);
      if (res.error) return setError(res.error);
      setOpen(false);
      router.refresh();
    });

  return (
    <div className={`rounded-xl border px-4 py-3 ${quoted ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Wrench className={`h-4 w-4 ${quoted ? "text-amber-700" : "text-slate-400"}`} />
        <p className={`text-sm ${quoted ? "text-amber-900" : "text-slate-600"}`}>
          {quoted ? (
            <>
              <span className="font-semibold">This order was quoted with installation.</span> Hand it over to service so the installation is planned.
            </>
          ) : (
            <>Supply and installation by us? Hand it over to service. (Not needed for supply-only sales.)</>
          )}
        </p>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`ml-auto rounded-lg px-3 py-1.5 text-sm font-medium ${quoted ? "bg-amber-600 text-white hover:bg-amber-500" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
          >
            Hand over for installation
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500 sm:col-span-2">
            <span className="mb-1 block">Site address *</span>
            <input value={v.siteAddress} onChange={(e) => setV({ ...v, siteAddress: e.target.value })} className={field} />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Site contact</span>
            <input value={v.contactName} onChange={(e) => setV({ ...v, contactName: e.target.value })} className={field} />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Contact phone *</span>
            <input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} className={field} />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Customer&apos;s preferred date</span>
            <input type="date" value={v.preferredDate} onChange={(e) => setV({ ...v, preferredDate: e.target.value })} className={field} />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">
            <span className="mb-1 block">For the installer (scope, site readiness, access, piping length, who supplies what...)</span>
            <textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={3} className={field} />
          </label>
          <div className="flex items-center justify-end gap-2 sm:col-span-2">
            {error && <p className="mr-auto text-sm text-rose-600">{error}</p>}
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
              {pending ? "Saving..." : "Hand over to service"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
