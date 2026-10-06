"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveIncentiveSettingsAction } from "../actions";
import type { IncentiveSettings } from "@/lib/incentive";

const input = "rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function IncentiveSettingsForm({
  initial,
  users,
  salesPeople,
}: {
  initial: IncentiveSettings;
  users: { id: string; name: string }[];
  salesPeople: { id: string; name: string }[];
}) {
  const [s, setS] = useState<IncentiveSettings>(initial);
  const [msg, setMsg] = useState<{ error?: string; ok?: boolean }>({});
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const num = (v: string) => (v === "" ? 0 : Number(v));

  const setTier = (i: number, patch: Partial<IncentiveSettings["tiers"][number]>) =>
    setS({ ...s, tiers: s.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const setSalary = (i: number, patch: Partial<IncentiveSettings["salarySupport"][number]>) =>
    setS({ ...s, salarySupport: s.salarySupport.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setStaff = (i: number, patch: Partial<IncentiveSettings["supportStaff"][number]>) =>
    setS({ ...s, supportStaff: s.supportStaff.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg({});
        startTransition(async () => {
          const res = await saveIncentiveSettingsAction(s);
          setMsg(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      <section>
        <label className="block text-sm font-semibold text-slate-900 mb-1">Incentives start from</label>
        <p className="text-xs text-slate-500 mb-2">Months before this show no incentive.</p>
        <input type="month" value={s.startMonth} onChange={(e) => setS({ ...s, startMonth: e.target.value })} className={`${input} w-48`} />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Rate tiers</h2>
        <p className="text-xs text-slate-500 mb-3">The highest tier whose achievement threshold is met sets the rate. Below every tier isn&apos;t eligible.</p>
        <div className="space-y-2">
          {s.tiers.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span>Achievement ≥</span>
              <input type="number" step="any" min={0} value={t.minAchievementPct} onChange={(e) => setTier(i, { minAchievementPct: num(e.target.value) })} className={`${input} w-24`} />
              <span>% earns</span>
              <input type="number" step="any" min={0} value={t.ratePct} onChange={(e) => setTier(i, { ratePct: num(e.target.value) })} className={`${input} w-24`} />
              <span>% of the month&apos;s sales</span>
              {s.tiers.length > 1 && (
                <button type="button" onClick={() => setS({ ...s, tiers: s.tiers.filter((_, j) => j !== i) })} className="text-xs text-rose-600 hover:text-rose-700">
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setS({ ...s, tiers: [...s.tiers, { minAchievementPct: 0, ratePct: 0 }] })} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
            + Add tier
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-1">Sales person keeps</label>
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <input type="number" step="any" min={0} max={100} value={s.salesPersonSharePct} onChange={(e) => setS({ ...s, salesPersonSharePct: num(e.target.value) })} className={`${input} w-24`} />
            <span>% - the other {Math.max(0, 100 - s.salesPersonSharePct)}% goes to support staff</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-1">Coordinator&apos;s first share (₦)</label>
          <input type="number" step="any" min={0} value={s.coordinatorFirstShare} onChange={(e) => setS({ ...s, coordinatorFirstShare: num(e.target.value) })} className={`${input} w-40`} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Support staff</h2>
        <p className="text-xs text-slate-500 mb-3">
          The coordinator takes the first share; the rest of the pool is split equally among everyone else here. Link a login to let that
          person see their own share.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Coordinator</th>
                <th className="py-2 pr-3 font-medium">Login (optional)</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {s.supportStaff.map((p, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-3">
                    <input value={p.name} onChange={(e) => setStaff(i, { name: e.target.value })} className={`${input} w-48`} />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input value={p.role} onChange={(e) => setStaff(i, { role: e.target.value })} className={`${input} w-44`} />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="radio"
                      name="coordinator"
                      checked={p.coordinator}
                      onChange={() => setS({ ...s, supportStaff: s.supportStaff.map((x, j) => ({ ...x, coordinator: j === i })) })}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <select value={p.userId ?? ""} onChange={(e) => setStaff(i, { userId: e.target.value || null })} className={`${input} w-48`}>
                      <option value="">No login</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5">
                    <button type="button" onClick={() => setS({ ...s, supportStaff: s.supportStaff.filter((_, j) => j !== i) })} className="text-xs text-rose-600 hover:text-rose-700">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() => setS({ ...s, supportStaff: [...s.supportStaff, { name: "", role: "", coordinator: false, userId: null }] })}
          className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          + Add support staff
        </button>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Salary support</h2>
        <p className="text-xs text-slate-500 mb-3">
          Paid on top of the sales person&apos;s share, as a % of their full incentive - only in months they qualify. It comes from the
          company, not from the support staff pool (100% = the full incentive again).
        </p>
        <div className="space-y-2">
          {s.salarySupport.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <select
                value={p.userId ?? ""}
                onChange={(e) => {
                  const u = salesPeople.find((x) => x.id === e.target.value);
                  setSalary(i, { userId: u?.id ?? null, name: u?.name ?? p.name });
                }}
                className={`${input} w-56`}
              >
                <option value="">{p.userId ? "Pick a sales person" : p.name || "Pick a sales person"}</option>
                {salesPeople.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <span>gets</span>
              <input type="number" step="any" min={0} value={p.pct} onChange={(e) => setSalary(i, { pct: num(e.target.value) })} className={`${input} w-24`} />
              <span>% of their incentive extra</span>
              <button type="button" onClick={() => setS({ ...s, salarySupport: s.salarySupport.filter((_, j) => j !== i) })} className="text-xs text-rose-600 hover:text-rose-700">
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setS({ ...s, salarySupport: [...s.salarySupport, { name: "", userId: null, pct: 100 }] })}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            + Add salary support
          </button>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={isPending} className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium px-4 py-2">
          {isPending ? "Saving…" : "Save scheme"}
        </button>
        {msg.ok && <span className="text-sm text-emerald-600">Saved - Incentives now use these settings.</span>}
        {msg.error && <span className="text-sm text-red-600">{msg.error}</span>}
      </div>
    </form>
  );
}
