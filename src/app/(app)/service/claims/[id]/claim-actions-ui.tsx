"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { ClaimStatus } from "@/lib/warranty-claims";
import { deleteWarrantyClaim, updateWarrantyClaim, type ClaimUpdate } from "../../claim-actions";

const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
const naira = (n: number) => `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const num = (s: string) => Number(s.replace(/,/g, "")) || 0;

function useRun() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      setError("");
      const res = await fn();
      if (res.error) return setError(res.error);
      after?.();
      router.refresh();
    });
  return { error, pending, run };
}

export function ClaimLines({ claimId, editable, lines }: { claimId: string; editable: boolean; lines: { id: string; name: string; qty: number; unitCost: number }[] }) {
  const { error, pending, run } = useRun();
  const [v, setV] = useState(lines.map((l) => ({ id: l.id, qty: String(l.qty), unitCost: String(l.unitCost) })));
  const total = lines.reduce((s, l, i) => s + num(v[i]?.qty ?? "0") * num(v[i]?.unitCost ?? "0"), 0);
  return (
    <div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {lines.map((l, i) => (
            <tr key={l.id}>
              <td className="py-1.5 pr-2 text-slate-800">{l.name}</td>
              <td className="py-1.5 pr-2 text-right">
                {editable ? (
                  <input value={v[i].qty} onChange={(e) => setV(v.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className={`${field} w-14 px-2 py-1 text-right`} />
                ) : (
                  l.qty
                )}
              </td>
              <td className="py-1.5 pr-2 text-right">
                {editable ? (
                  <input value={v[i].unitCost} onChange={(e) => setV(v.map((x, j) => (j === i ? { ...x, unitCost: e.target.value } : x)))} className={`${field} w-24 px-2 py-1 text-right`} />
                ) : (
                  naira(l.unitCost)
                )}
              </td>
              {editable && (
                <td className="py-1.5 text-right">
                  <button type="button" disabled={pending} onClick={() => run(() => updateWarrantyClaim(claimId, { removeLine: l.id }))} className="text-slate-400 hover:text-rose-600" aria-label="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-right text-sm font-semibold text-slate-900">Total {naira(total)}</p>
      {editable && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => updateWarrantyClaim(claimId, { lines: v.map((x) => ({ id: x.id, qty: num(x.qty), unitCost: num(x.unitCost) })) }))}
          className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Save parts
        </button>
      )}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export function ClaimActions(p: { id: string; status: ClaimStatus; claimNo: string; claimAmount: number; approvedAmount: number | null; partsReturned: boolean; notes: string }) {
  const router = useRouter();
  const { error, pending, run } = useRun();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [claimNo, setClaimNo] = useState(p.claimNo);
  const [approved, setApproved] = useState(String(p.approvedAmount ?? p.claimAmount));
  const [credited, setCredited] = useState(String(p.approvedAmount ?? p.claimAmount));
  const [cn, setCn] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState(p.notes);
  const [returned, setReturned] = useState(p.partsReturned);
  const send = (u: ClaimUpdate) => run(() => updateWarrantyClaim(p.id, { date, ...u }));
  const btn = "rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Manufacturer&apos;s claim no.</span>
          <input value={claimNo} onChange={(e) => setClaimNo(e.target.value)} className={`${field} w-44`} />
        </label>
        {p.status === "DRAFT" && (
          <button type="button" disabled={pending} onClick={() => send({ status: "SUBMITTED", claimNo })} className={`${btn} bg-sky-600 hover:bg-sky-500`}>
            Mark submitted
          </button>
        )}
        {p.status !== "DRAFT" && (
          <button type="button" disabled={pending} onClick={() => send({ claimNo })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Save claim no.
          </button>
        )}
      </div>

      {(p.status === "SUBMITTED" || p.status === "REJECTED") && (
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Approved amount (₦)</span>
            <input inputMode="decimal" value={approved} onChange={(e) => setApproved(e.target.value)} className={`${field} w-36 text-right`} />
          </label>
          <button type="button" disabled={pending} onClick={() => send({ status: "APPROVED", approvedAmount: num(approved) })} className={`${btn} bg-violet-600 hover:bg-violet-500`}>
            Approved
          </button>
          <label className="min-w-[220px] flex-1 text-xs text-slate-500">
            <span className="mb-1 block">Or rejected - why</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={`${field} w-full`} placeholder="e.g. physical damage, out of manufacturer warranty" />
          </label>
          <button type="button" disabled={pending} onClick={() => send({ status: "REJECTED", reason })} className={`${btn} bg-rose-600 hover:bg-rose-500`}>
            Rejected
          </button>
        </div>
      )}

      {(p.status === "APPROVED" || p.status === "SUBMITTED") && (
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Credited amount (₦)</span>
            <input inputMode="decimal" value={credited} onChange={(e) => setCredited(e.target.value)} className={`${field} w-36 text-right`} />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Credit note no.</span>
            <input value={cn} onChange={(e) => setCn(e.target.value)} className={`${field} w-40`} />
          </label>
          <button type="button" disabled={pending} onClick={() => send({ status: "CREDITED", creditedAmount: num(credited), creditNoteNo: cn })} className={`${btn} bg-emerald-600 hover:bg-emerald-500`}>
            Credited - recovered
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={returned}
            disabled={pending}
            onChange={(e) => {
              setReturned(e.target.checked);
              send({ partsReturned: e.target.checked });
            }}
            className="h-4 w-4 rounded border-slate-300"
          />
          Faulty parts returned to the manufacturer (on the date above)
        </label>
        <label className="min-w-[240px] flex-1 text-xs text-slate-500">
          <span className="mb-1 block">Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${field} w-full`} />
        </label>
        <button type="button" disabled={pending} onClick={() => send({ notes })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Save notes
        </button>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-sm">
        {p.status !== "DRAFT" && (
          <button type="button" disabled={pending} onClick={() => confirm("Back to draft (clears the submission and decision)?") && send({ status: "DRAFT" })} className="text-slate-500 hover:text-slate-800">
            Back to draft
          </button>
        )}
        {p.status === "DRAFT" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => confirm("Delete this draft claim?") && run(() => deleteWarrantyClaim(p.id), () => router.push("/service/claims"))}
            className="text-rose-600 hover:text-rose-700"
          >
            Delete draft
          </button>
        )}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
