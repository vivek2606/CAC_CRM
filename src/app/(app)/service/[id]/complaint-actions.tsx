"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { SERIAL_NA_PREFIX, SERIAL_NA_REASONS, STATUS_LABEL, isSerialNA, serialNA, type ComplaintStatus } from "@/lib/service";
import { addComplaintPart, removeComplaintPart, updateComplaint, type ComplaintUpdate, type PartInput } from "../actions";

const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
const naira = (n: number) => `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

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

export function ComplaintActions(p: {
  id: string;
  status: ComplaintStatus;
  now: string;
  technician: string;
  technicians: string[];
  rootCause: string;
  resolution: string;
  feedback: number | null;
  inWarranty: boolean;
  serviceCharge: number;
  chargeInvoiceNo: string;
  serialNo: string;
}) {
  const { error, pending, run } = useRun();
  const [at, setAt] = useState(p.now);
  const [tech, setTech] = useState(p.technician);
  const [rootCause, setRootCause] = useState(p.rootCause);
  const [resolution, setResolution] = useState(p.resolution);
  const [feedback, setFeedback] = useState(p.feedback ? String(p.feedback) : "");
  const [charge, setCharge] = useState(p.serviceCharge ? String(p.serviceCharge) : "");
  const [chargeInv, setChargeInv] = useState(p.chargeInvoiceNo);
  const [wNote, setWNote] = useState("");
  // The serial no., or why it isn't available (plate not visible / sorted
  // out remotely) - either lets the complaint be resolved.
  const [naReason, setNaReason] = useState(isSerialNA(p.serialNo) ? p.serialNo.slice(SERIAL_NA_PREFIX.length + 3) : "");
  const [typed, setTyped] = useState(isSerialNA(p.serialNo) ? "" : p.serialNo);
  const serial = naReason ? serialNA(naReason) : typed;
  const send = (u: ComplaintUpdate) => run(() => updateComplaint(p.id, { at, ...u }));
  const done = p.status === "RESOLVED" || p.status === "CLOSED" || p.status === "CANCELLED";
  const btn = "rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50";
  // Resolving / closing sends the serial no. too (needed by then).
  const text = { rootCause, resolution, serialNo: serial };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">When (Lagos time)</span>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={field} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Technician</span>
          <input value={tech} onChange={(e) => setTech(e.target.value)} list="techs" className={`${field} w-48`} />
          <datalist id="techs">
            {p.technicians.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <button type="button" disabled={pending || !tech.trim() || tech === p.technician} onClick={() => send({ technician: tech })} className={`${btn} bg-slate-900 text-white hover:bg-slate-700`}>
          {p.technician ? "Reassign" : "Assign"}
        </button>
        {!done && (
          <>
            <button type="button" disabled={pending} onClick={() => send({ addVisit: true, ...(tech !== p.technician ? { technician: tech } : {}) })} className={`${btn} bg-sky-600 text-white hover:bg-sky-500`}>
              Record a visit
            </button>
            <button type="button" disabled={pending} onClick={() => send({ status: "AWAITING_SPARES" })} className={`${btn} border border-violet-300 text-violet-800 hover:bg-violet-50`}>
              Awaiting spares
            </button>
          </>
        )}
      </div>

      <div className={`flex flex-wrap items-end gap-2 rounded-lg px-3 py-2 ${p.serialNo ? "bg-slate-50" : "bg-amber-50"}`}>
        <label className="text-xs text-slate-600">
          <span className="mb-1 block font-medium">Unit serial no. (from the site visit) *</span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={!!naReason}
            placeholder={naReason ? "Not available" : "e.g. 34012345678901"}
            className={`${field} w-64 disabled:bg-slate-100`}
          />
        </label>
        <label className="text-xs text-slate-600">
          <span className="mb-1 block">or not available, because</span>
          <select value={naReason} onChange={(e) => setNaReason(e.target.value)} className={field}>
            <option value="">-</option>
            {SERIAL_NA_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending || serial.trim() === p.serialNo}
          onClick={() => send({ serialNo: serial })}
          className={`${btn} bg-slate-900 text-white hover:bg-slate-700`}
        >
          Save serial no.
        </button>
        <span className="pb-2 text-xs text-slate-500">
          {isSerialNA(p.serialNo)
            ? "Not available - recorded with the reason."
            : p.serialNo
              ? "Recorded on the unit too."
              : "Needed before resolving (warranty spare claims, Midea troubleshooting) - or say why it isn't available."}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Root cause</span>
          <input value={rootCause} onChange={(e) => setRootCause(e.target.value)} className={`${field} w-full`} placeholder="e.g. PCB failure due to voltage surge" />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">What was done</span>
          <input value={resolution} onChange={(e) => setResolution(e.target.value)} className={`${field} w-full`} placeholder="e.g. Replaced outdoor PCB, tested OK" />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {!done && (
          <button type="button" disabled={pending} onClick={() => send({ status: "RESOLVED", ...text })} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}>
            Resolved
          </button>
        )}
        {p.status !== "CLOSED" && p.status !== "CANCELLED" && (
          <>
            <label className="text-xs text-slate-500">
              <span className="mb-1 block">Customer rating</span>
              <select value={feedback} onChange={(e) => setFeedback(e.target.value)} className={field}>
                <option value="">Not given</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)} {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() => send({ status: "CLOSED", ...text, feedback: feedback ? Number(feedback) : null })}
              className={`${btn} bg-slate-700 text-white hover:bg-slate-600`}
            >
              Close (customer satisfied)
            </button>
          </>
        )}
        {(p.status === "RESOLVED" || p.status === "CLOSED") && (
          <button type="button" disabled={pending} onClick={() => send({ status: "IN_PROGRESS" })} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>
            Reopen
          </button>
        )}
        {done || (
          <button type="button" disabled={pending} onClick={() => send({ ...text })} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>
            Save notes
          </button>
        )}
        {!done && (
          <button
            type="button"
            disabled={pending}
            onClick={() => confirm("Cancel this complaint (registered by mistake / withdrawn)?") && send({ status: "CANCELLED" })}
            className={`${btn} ml-auto text-rose-600 hover:text-rose-700`}
          >
            Cancel complaint
          </button>
        )}
      </div>

      {!p.inWarranty && (
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Service charge (₦, excl. VAT)</span>
            <input inputMode="decimal" value={charge} onChange={(e) => setCharge(e.target.value)} className={`${field} w-40 text-right`} />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Invoice no. raised</span>
            <input value={chargeInv} onChange={(e) => setChargeInv(e.target.value)} className={`${field} w-40`} />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => send({ serviceCharge: Number(charge.replace(/,/g, "")) || 0, chargeInvoiceNo: chargeInv })}
            className={`${btn} bg-amber-600 text-white hover:bg-amber-500`}
          >
            Save charges
          </button>
        </div>
      )}

      <details className="border-t border-slate-100 pt-3 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-slate-500">Change warranty (exceptional terms)</summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="min-w-[260px] flex-1 text-xs text-slate-500">
            <span className="mb-1 block">Why</span>
            <input value={wNote} onChange={(e) => setWNote(e.target.value)} className={`${field} w-full`} placeholder="e.g. extended 2-year warranty in the PO" />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => send({ warrantyOverride: p.inWarranty ? "out" : "in", warrantyNote: wNote })}
            className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}
          >
            Treat as {p.inWarranty ? "out of" : "in"} warranty
          </button>
        </div>
      </details>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <p className="text-xs text-slate-400">Status now: {STATUS_LABEL[p.status]}. Times default to now - change &ldquo;When&rdquo; to record something that happened earlier.</p>
    </div>
  );
}

type Part = { id: string; kind: string; name: string; qty: number; unit: string; unitCost: number; unitPrice: number; chargeable: boolean };

export function PartsEditor({ complaintId, inWarranty, parts, names }: { complaintId: string; inWarranty: boolean; parts: Part[]; names: string[] }) {
  const { error, pending, run } = useRun();
  const blank = (): PartInput => ({ kind: "SPARE", name: "", qty: 1, unit: "No.", unitCost: 0, unitPrice: 0, chargeable: !inWarranty });
  const [p, setP] = useState<PartInput>(blank());
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const n = (s: string) => Number(s.replace(/,/g, "")) || 0;
  return (
    <div>
      {parts.length > 0 && (
        <table className="mb-3 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
              <th className="py-1.5 pr-2 font-medium">Type</th>
              <th className="py-1.5 pr-2 font-medium">Item</th>
              <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
              <th className="py-1.5 pr-2 text-right font-medium">Our cost</th>
              <th className="py-1.5 pr-2 text-right font-medium">Charged</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {parts.map((x) => (
              <tr key={x.id}>
                <td className="py-1.5 pr-2 text-xs text-slate-500">{x.kind === "CONSUMABLE" ? "Consumable" : "Spare"}</td>
                <td className="py-1.5 pr-2 text-slate-800">{x.name}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {x.qty} {x.unit}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{naira(x.qty * x.unitCost)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{x.chargeable ? naira(x.qty * x.unitPrice) : <span className="text-emerald-700">Free</span>}</td>
                <td className="py-1.5 text-right">
                  <button type="button" disabled={pending} onClick={() => run(() => removeComplaintPart(x.id))} className="text-slate-400 hover:text-rose-600" aria-label="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <select value={p.kind} onChange={(e) => setP({ ...p, kind: e.target.value as PartInput["kind"], unit: e.target.value === "CONSUMABLE" ? "Kg" : "No." })} className={field}>
          <option value="SPARE">Spare</option>
          <option value="CONSUMABLE">Consumable</option>
        </select>
        <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} list="part-names" placeholder={p.kind === "CONSUMABLE" ? "e.g. R410A gas, copper pipe" : "e.g. Outdoor PCB, fan motor"} className={`${field} w-60`} />
        <datalist id="part-names">
          {names.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={`${field} w-16 text-right`} aria-label="Qty" />
        <input value={p.unit} onChange={(e) => setP({ ...p, unit: e.target.value })} className={`${field} w-16`} aria-label="Unit" />
        <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Our cost / unit" className={`${field} w-32 text-right`} />
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={p.chargeable} onChange={(e) => setP({ ...p, chargeable: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
          Chargeable
        </label>
        {p.chargeable && <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price / unit" className={`${field} w-32 text-right`} />}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => addComplaintPart(complaintId, { ...p, qty: n(qty), unitCost: n(cost), unitPrice: n(price) }),
              () => {
                setP(blank());
                setQty("1");
                setCost("");
                setPrice("");
              },
            )
          }
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-400">{inWarranty ? "In warranty: spares are free to the customer (tick Chargeable only for something not covered)." : "Out of warranty: spares are charged to the customer."}</p>
      {error && <p className="mt-1 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
