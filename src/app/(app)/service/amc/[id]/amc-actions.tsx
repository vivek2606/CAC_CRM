"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AmcStatus } from "@/lib/amc";
import { recordAmcVisit, renewAmc, setAmcUnits, updateAmc } from "../../base-actions";

const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
const dmy = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

function useRun() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string; id?: string }>, after?: (r: { id?: string }) => void) =>
    start(async () => {
      setError("");
      const res = await fn();
      if (res.error) return setError(res.error);
      after?.(res);
      router.refresh();
    });
  return { error, pending, run };
}

export function VisitRow({ v }: { v: { id: string; due: string; doneAt: string; technician: string; notes: string } }) {
  const { error, pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [doneOn, setDoneOn] = useState(v.doneAt || today);
  const [tech, setTech] = useState(v.technician);
  const [notes, setNotes] = useState(v.notes);
  const overdue = !v.doneAt && v.due < today;
  return (
    <>
      <tr>
        <td className={`py-1.5 pr-2 whitespace-nowrap ${overdue ? "font-semibold text-rose-600" : "text-slate-700"}`}>
          {dmy(v.due)}
          {overdue && " · overdue"}
        </td>
        <td className="py-1.5 pr-2 whitespace-nowrap">{v.doneAt ? <span className="text-emerald-700">✓ {dmy(v.doneAt)}</span> : <span className="text-slate-400">Not yet</span>}</td>
        <td className="py-1.5 pr-2 text-xs text-slate-600">{[v.technician, v.notes].filter(Boolean).join(" - ")}</td>
        <td className="py-1.5 text-right">
          <button type="button" onClick={() => setOpen(!open)} className="text-xs font-medium text-indigo-600">
            {v.doneAt ? "Edit" : "Record visit"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} className="bg-slate-50 px-2 py-2">
            <div className="flex flex-wrap items-end gap-2">
              <input type="date" value={doneOn} onChange={(e) => setDoneOn(e.target.value)} className={field} />
              <input value={tech} onChange={(e) => setTech(e.target.value)} placeholder="Technician" className={`${field} w-40`} />
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Work done, findings" className={`${field} min-w-[200px] flex-1`} />
              <button type="button" disabled={pending} onClick={() => run(() => recordAmcVisit(v.id, doneOn, tech, notes), () => setOpen(false))} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                Save
              </button>
              {v.doneAt && (
                <button type="button" disabled={pending} onClick={() => run(() => recordAmcVisit(v.id, "", tech, notes), () => setOpen(false))} className="text-xs text-rose-600">
                  Not done
                </button>
              )}
            </div>
            {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

export function AmcUnits({ contractId, units, others }: { contractId: string; units: { id: string; label: string }[]; others: { id: string; label: string }[] }) {
  const { error, pending, run } = useRun();
  const [add, setAdd] = useState("");
  return (
    <div>
      {units.length === 0 ? (
        <p className="text-sm text-slate-500">No units yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {units.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-1.5">
              <span className="text-slate-700">{u.label}</span>
              <button type="button" disabled={pending} onClick={() => run(() => setAmcUnits(contractId, [], [u.id]))} className="text-xs text-rose-600 hover:text-rose-700">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={add} onChange={(e) => setAdd(e.target.value)} className={`${field} max-w-full`}>
            <option value="">Add another of the customer&apos;s units...</option>
            {others.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
          <button type="button" disabled={pending || !add} onClick={() => run(() => setAmcUnits(contractId, [add], []), () => setAdd(""))} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            Add
          </button>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-400">Units not in the list can be added by hand under Installed units.</p>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export function AmcActions({ id, status, invoiceNo, value, visitsPerYear, renewed }: { id: string; status: AmcStatus; invoiceNo: string; value: number; visitsPerYear: number; renewed: boolean }) {
  const router = useRouter();
  const { error, pending, run } = useRun();
  const [inv, setInv] = useState(invoiceNo);
  const [newValue, setNewValue] = useState(String(value || ""));
  const [visits, setVisits] = useState(visitsPerYear);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Invoice no. (when billed)</span>
          <input value={inv} onChange={(e) => setInv(e.target.value)} className={`${field} w-44`} />
        </label>
        <button type="button" disabled={pending} onClick={() => run(() => updateAmc(id, { invoiceNo: inv }))} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          Save
        </button>
        <Link href={`/quotations?amc=${id}`} className="ml-auto rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500">
          Prepare AMC quotation / proforma
        </Link>
      </div>
      {!renewed && status !== "CANCELLED" && (
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <span className="text-sm font-medium text-slate-800">Renew for another year:</span>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Value (₦, excl. VAT)</span>
            <input inputMode="decimal" value={newValue} onChange={(e) => setNewValue(e.target.value)} className={`${field} w-40 text-right`} />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Visits a year</span>
            <input type="number" min={1} max={12} value={visits} onChange={(e) => setVisits(Number(e.target.value) || 4)} className={`${field} w-20`} />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => renewAmc(id, Number(newValue.replace(/,/g, "")) || 0, visits), (r) => r.id && router.push(`/service/amc/${r.id}`))}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Renew
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => confirm("Cancel this AMC? Its units are no longer covered.") && run(() => updateAmc(id, { cancelled: true }))}
            className="ml-auto text-sm text-rose-600 hover:text-rose-700"
          >
            Cancel contract
          </button>
        </div>
      )}
      {status === "CANCELLED" && (
        <button type="button" disabled={pending} onClick={() => run(() => updateAmc(id, { cancelled: false }))} className="text-sm text-indigo-600">
          Restore (not cancelled)
        </button>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
