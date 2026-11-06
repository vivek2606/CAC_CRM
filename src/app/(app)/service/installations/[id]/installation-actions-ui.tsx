"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { commissionInstallation, updateInstallation, type InstallUpdate } from "../../installation-actions";
import type { InstallStatus } from "@/lib/installation";

type Unit = { unitId: string; model: string; qty: number; serials: string[] };
const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
const btn = "rounded-lg px-3.5 py-2 text-sm font-medium disabled:opacity-50";

export function InstallationActions({
  id,
  status,
  scheduledDate,
  team,
  teams,
  units,
  today,
  details,
}: {
  id: string;
  status: InstallStatus;
  scheduledDate: string;
  team: string;
  teams: string[];
  units: Unit[];
  today: string;
  details: { notes: string; contactName: string; phone: string; siteAddress: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [sched, setSched] = useState({ scheduledDate, team });
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [showCommission, setShowCommission] = useState(false);
  const [commissionedAt, setCommissionedAt] = useState(today);
  const [serials, setSerials] = useState<Record<string, string[]>>(() => Object.fromEntries(units.map((u) => [u.unitId, [...u.serials]])));
  const [missingReason, setMissingReason] = useState("");
  const [d, setD] = useState(details);
  const closed = status === "COMMISSIONED" || status === "CANCELLED";
  const missing = Object.values(serials).flat().filter((s) => !s.trim()).length;

  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      setError("");
      const res = await fn();
      if (res.error) return setError(res.error);
      after?.();
      router.refresh();
    });
  const update = (u: InstallUpdate, after?: () => void) => run(() => updateInstallation(id, u), after);

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {!closed && (
        <section className="rounded-lg border border-slate-200 p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">1. Schedule</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-500">
              <span className="mb-1 block">Installation date</span>
              <input type="date" value={sched.scheduledDate} onChange={(e) => setSched({ ...sched, scheduledDate: e.target.value })} className={`${field} w-44`} />
            </label>
            <label className="min-w-[200px] flex-1 text-xs text-slate-500">
              <span className="mb-1 block">Team / contractor</span>
              <input value={sched.team} onChange={(e) => setSched({ ...sched, team: e.target.value })} list="install-teams" className={field} />
              <datalist id="install-teams">
                {teams.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <button type="button" disabled={pending} onClick={() => update({ action: "schedule", ...sched })} className={`${btn} bg-slate-900 text-white hover:bg-slate-700`}>
              {status === "PENDING" ? "Schedule" : "Update"}
            </button>
            {status === "SCHEDULED" && (
              <button type="button" disabled={pending} onClick={() => update({ action: "start" })} className={`${btn} border border-indigo-200 text-indigo-700 hover:bg-indigo-50`}>
                Mark installing
              </button>
            )}
          </div>
        </section>
      )}

      {!closed && (
        <section className="rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">2. Commission</h3>
            <span className="text-xs text-slate-500">After testing - record each unit&apos;s serial no. from its plate.</span>
            {!showCommission && (
              <button type="button" onClick={() => setShowCommission(true)} className={`${btn} ml-auto bg-emerald-600 text-white hover:bg-emerald-500`}>
                Commission
              </button>
            )}
          </div>
          {showCommission && (
            <div className="mt-3 space-y-3">
              <label className="block text-xs text-slate-500">
                <span className="mb-1 block">Commissioned on *</span>
                <input type="date" max={today} value={commissionedAt} onChange={(e) => setCommissionedAt(e.target.value)} className={`${field} w-44`} />
              </label>
              {units.length === 0 ? (
                <p className="text-sm text-slate-500">No products on this deal - nothing to record.</p>
              ) : (
                units.map((u) => (
                  <div key={u.unitId}>
                    <p className="mb-1 text-xs font-medium text-slate-700">
                      {u.qty} × {u.model}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {serials[u.unitId].map((sn, i) => (
                        <input
                          key={i}
                          value={sn}
                          onChange={(e) => setSerials((s) => ({ ...s, [u.unitId]: s[u.unitId].map((x, j) => (j === i ? e.target.value : x)) }))}
                          placeholder={`Unit ${i + 1} serial no.`}
                          className="w-52 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
              {missing > 0 && (
                <label className="block text-xs text-slate-500">
                  <span className="mb-1 block">
                    {missing} serial no{missing === 1 ? "." : "s."} not filled - why? (e.g. indoor plate not reachable after ceiling closed)
                  </span>
                  <input value={missingReason} onChange={(e) => setMissingReason(e.target.value)} className={field} />
                </label>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCommission(false)} className={`${btn} text-slate-600 hover:text-slate-900`}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => commissionInstallation(id, { commissionedAt, units: Object.entries(serials).map(([unitId, s]) => ({ unitId, serials: s })), missingReason }),
                      () => setShowCommission(false),
                    )
                  }
                  className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}
                >
                  {pending ? "Saving..." : "Save - commissioned"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-slate-200 p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Site and notes</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={d.siteAddress} onChange={(e) => setD({ ...d, siteAddress: e.target.value })} placeholder="Site address" className={`${field} sm:col-span-2`} />
          <input value={d.contactName} onChange={(e) => setD({ ...d, contactName: e.target.value })} placeholder="Site contact" className={field} />
          <input value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="Phone" className={field} />
          <textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Notes (site visits, issues, what's left)" rows={2} className={`${field} sm:col-span-2`} />
        </div>
        <div className="mt-2 flex justify-end">
          <button type="button" disabled={pending} onClick={() => update({ action: "notes", ...d })} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}>
            Save
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {closed ? (
          <button type="button" disabled={pending} onClick={() => update({ action: "reopen" })} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}>
            Reopen
          </button>
        ) : showCancel ? (
          <>
            <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why cancelled (e.g. customer's own installer)" className={`${field} max-w-sm`} />
            <button type="button" disabled={pending} onClick={() => update({ action: "cancel", reason: cancelReason }, () => setShowCancel(false))} className={`${btn} bg-rose-600 text-white hover:bg-rose-500`}>
              Cancel installation
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setShowCancel(true)} className={`${btn} text-rose-600 hover:text-rose-700`}>
            Not installing after all?
          </button>
        )}
      </div>
    </div>
  );
}
