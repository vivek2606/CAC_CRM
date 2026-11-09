"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestReservation, decideReservation, extendReservation, releaseReservation } from "./actions";

const btn = "rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50";

// Approve / reject (the Head, with a note), extend (the Head), release.
export function ReservationActions({ id, status, isHead, canRelease }: { id: string; status: string; isHead: boolean; canRelease: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      const res = await fn();
      setErr(res.error ?? "");
      if (!res.error) router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {isHead && status === "REQUESTED" && (
        <>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (needed to reject)" className="w-44 rounded-md border border-slate-200 px-2 py-1 text-xs" />
          <button type="button" disabled={pending} onClick={() => run(() => decideReservation(id, true, note))} className={`${btn} border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}>
            Approve
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => decideReservation(id, false, note))} className={`${btn} border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100`}>
            Reject
          </button>
        </>
      )}
      {isHead && status === "APPROVED" && (
        <button type="button" disabled={pending} onClick={() => run(() => extendReservation(id))} className={`${btn} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
          Extend 14 days
        </button>
      )}
      {canRelease && (status === "REQUESTED" || status === "APPROVED") && (
        <button
          type="button"
          disabled={pending}
          onClick={() => confirm(status === "REQUESTED" ? "Withdraw this request?" : "Release these units for others to sell?") && run(() => releaseReservation(id))}
          className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
        >
          {status === "REQUESTED" ? "Withdraw" : "Release"}
        </button>
      )}
      {err && <span className="text-xs text-rose-600">{err}</span>}
    </div>
  );
}

type Option = { productId: string; label: string; free: number };

// Ask to hold stock for a deal: the deal's items to start with, more can
// be added.
export function ReservationRequestForm({ dealId, start: initial, products }: { dealId: string; start: (Option & { qty: number })[]; products: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(initial.map((r) => ({ productId: r.productId, qty: Math.min(r.qty, r.free) })));
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [pending, startT] = useTransition();
  const byId = new Map(products.map((p) => [p.productId, p]));
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
        Request stock reservation
      </button>
    );
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select
            value={r.productId}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))}
            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Pick an item...</option>
            {products.map((p) => (
              <option key={p.productId} value={p.productId}>
                {p.label} - {p.free} free
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={r.qty || ""}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: Math.max(0, Math.round(Number(e.target.value) || 0)) } : x)))}
            className="w-20 rounded-md border border-slate-200 px-2 py-1.5 text-right text-sm"
          />
          <span className="w-16 text-xs text-slate-400">{r.productId ? `${byId.get(r.productId)?.free ?? 0} free` : ""}</span>
          <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-xs text-slate-400 hover:text-rose-600">
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { productId: "", qty: 1 }])} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
        + Add an item
      </button>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why hold it? e.g. advance promised by Friday" className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startT(async () => {
              const res = await requestReservation(dealId, rows, reason);
              setErr(res.error ?? "");
              if (!res.error) {
                setOpen(false);
                setReason("");
                router.refresh();
              }
            })
          }
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Send to the Head for approval
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:text-slate-700">
          Cancel
        </button>
        {err && <span className="text-xs text-rose-600">{err}</span>}
      </div>
      <p className="text-xs text-slate-500">Approved units are held for this deal for 14 days, or until they&apos;re invoiced on it.</p>
    </div>
  );
}
