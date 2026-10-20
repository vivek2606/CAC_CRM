"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Heading, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui";
import { BILLING_TYPES, type ServiceInvoiceInput } from "@/lib/service-invoice-schema";

export type InvoicePrefill = ServiceInvoiceInput;

type Row =
  | { uid: string; kind: "section"; label: string }
  | { uid: string; kind: "item"; description: string; unit: string; qty: string; rate: string };

const uid = () => Math.random().toString(36).slice(2);
const num = (v: string) => {
  const n = Number(String(v).replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const naira = (n: number) => `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const blankItem = (): Row => ({ uid: uid(), kind: "item", description: "", unit: "Lot", qty: "1", rate: "" });

// The Somotex service / project invoice form: every line is typed in (no
// product list), VAT on or off, and the payment received so far - the
// balance is worked out. Downloading saves it (a new one gets its number).
export function InvoiceBuilder({
  prefill,
  vatRatePct,
  defaultTerms,
  signatory,
}: {
  prefill: InvoicePrefill | null;
  vatRatePct: number;
  defaultTerms: string[];
  signatory: { name: string; designation: string; phone: string };
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [ref, setRef] = useState(prefill?.ref ?? "");
  const [date, setDate] = useState(prefill?.date ?? today);
  const [billingType, setBillingType] = useState<(typeof BILLING_TYPES)[number]>(prefill?.billingType ?? "Service");
  const [to, setTo] = useState(prefill?.to ?? "");
  const [attention, setAttention] = useState(prefill?.attention ?? "");
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [withVat, setWithVat] = useState(prefill?.withVat ?? true);
  const [rows, setRows] = useState<Row[]>(() =>
    prefill?.rows.length
      ? prefill.rows.map((r) =>
          r.kind === "section" ? { uid: uid(), kind: "section", label: r.label } : { uid: uid(), kind: "item", description: r.description, unit: r.unit, qty: String(r.qty), rate: String(r.rate) },
        )
      : [blankItem()],
  );
  const [received, setReceived] = useState(prefill?.received ? String(prefill.received) : "");
  const [terms, setTerms] = useState((prefill?.terms ?? defaultTerms).join("\n"));
  const [sign, setSign] = useState({
    name: prefill?.signatoryName || signatory.name,
    designation: prefill?.signatoryDesignation || signatory.designation,
    phone: prefill?.signatoryPhone || signatory.phone,
  });
  const [checkedBy, setCheckedBy] = useState(prefill?.checkedBy ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const setRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.uid === id ? ({ ...r, ...patch } as Row) : r)));
  const amountOf = (r: Row) => (r.kind === "item" ? round2(num(r.qty) * num(r.rate)) : 0);
  // With VAT the amounts entered include it: total = what's entered; the
  // basic amount is each line less VAT (as service-invoice.ts prints it).
  const total = round2(rows.reduce((s, r) => s + amountOf(r), 0));
  const f = withVat ? 1 + vatRatePct / 100 : 1;
  const subtotal = round2(rows.reduce((s, r) => s + round2(amountOf(r) / f), 0));
  const vat = round2(total - subtotal);
  const paid = round2(num(received));
  const balance = round2(total - paid);

  const download = async () => {
    setError(null);
    setDone(null);
    if (!to.trim()) return setError('Enter the customer\'s name (first line of "Bill to").');
    if (!rows.some((r) => r.kind === "item" && r.description.trim() && num(r.qty) > 0)) return setError("Add at least one line item - description, qty and rate.");
    if (paid > total + 0.005) return setError("The payment received is more than the invoice total.");
    const body: ServiceInvoiceInput = {
      ref,
      date,
      billingType,
      to,
      attention,
      title,
      withVat,
      rows: rows.map((r) => (r.kind === "section" ? { kind: "section", label: r.label } : { kind: "item", description: r.description, unit: r.unit || "Lot", qty: num(r.qty), rate: num(r.rate) })),
      received: paid,
      terms: terms.split("\n"),
      signatoryName: sign.name,
      signatoryDesignation: sign.designation,
      signatoryPhone: sign.phone,
      checkedBy,
    };
    setBusy(true);
    try {
      const res = await fetch("/project-billing/invoice/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        return setError(j?.error ?? "Couldn't prepare the invoice - try again.");
      }
      const newRef = res.headers.get("X-Invoice-Ref") ?? ref;
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "Invoice.pdf";
      a.click();
      URL.revokeObjectURL(a.href);
      setRef(newRef);
      setDone(`Invoice ${newRef} downloaded and saved.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const label = "block text-[11px] font-medium text-slate-500 mb-1";

  return (
    <Card className="p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{ref ? `Invoice ${ref}` : "New invoice"}</h2>
        {ref && (
          <Link href="/project-billing/invoice" className="text-sm text-indigo-600 hover:text-indigo-700">
            + Start a new invoice
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <span className={label}>Invoice no.</span>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{ref || "Given on download"}</p>
        </div>
        <label>
          <span className={label}>Invoice date *</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </label>
        <label>
          <span className={label}>Billing type *</span>
          <select value={billingType} onChange={(e) => setBillingType(e.target.value as (typeof BILLING_TYPES)[number])} className={input}>
            {BILLING_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className={label}>VAT</span>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setWithVat(v)}
                className={`flex-1 rounded-md px-2 py-1 text-sm font-medium ${withVat === v ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
              >
                {v ? `With VAT (${vatRatePct}%, rates incl.)` : "Without VAT"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label>
          <span className={label}>Bill to * (first line = customer name, then address)</span>
          <textarea rows={3} value={to} onChange={(e) => setTo(e.target.value)} placeholder={"Customer name\nAddress"} className={input} />
        </label>
        <div className="space-y-3">
          <label className="block">
            <span className={label}>Kind attention</span>
            <input value={attention} onChange={(e) => setAttention(e.target.value)} className={input} />
          </label>
          <label className="block">
            <span className={label}>Subject (Re:)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Servicing of VRF system - October 2026" className={input} />
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm" data-own-head>
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Description *</th>
              <th className="px-3 py-2 font-medium w-24">Unit</th>
              <th className="px-3 py-2 font-medium w-24 text-right">Qty</th>
              <th className="px-3 py-2 font-medium w-40 text-right">{withVat ? "Rate incl. VAT (₦)" : "Rate (₦)"}</th>
              <th className="px-3 py-2 font-medium w-40 text-right">{withVat ? "Amount incl. VAT (₦)" : "Amount (₦)"}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid} className="border-t border-slate-100 align-top">
                {r.kind === "section" ? (
                  <td colSpan={5} className="px-3 py-2">
                    <input value={r.label} onChange={(e) => setRow(r.uid, { label: e.target.value })} placeholder="Section heading" className={`${input} font-semibold`} />
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-2">
                      <textarea rows={1} value={r.description} onChange={(e) => setRow(r.uid, { description: e.target.value })} placeholder="e.g. Servicing of 12 indoor units" className={input} />
                    </td>
                    <td className="px-3 py-2">
                      <input value={r.unit} onChange={(e) => setRow(r.uid, { unit: e.target.value })} className={input} />
                    </td>
                    <td className="px-3 py-2">
                      <input inputMode="decimal" value={r.qty} onChange={(e) => setRow(r.uid, { qty: e.target.value })} className={`${input} text-right`} />
                    </td>
                    <td className="px-3 py-2">
                      <input inputMode="decimal" value={r.rate} onChange={(e) => setRow(r.uid, { rate: e.target.value })} placeholder="0.00" className={`${input} text-right`} />
                    </td>
                    <td className="px-3 py-2 pt-4 text-right tabular-nums font-medium text-slate-800">{naira(amountOf(r))}</td>
                  </>
                )}
                <td className="px-2 py-2 pt-4">
                  <button type="button" title="Remove" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.uid !== r.uid) : [blankItem()]))} className="text-slate-400 hover:text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
          <button type="button" onClick={() => setRows((rs) => [...rs, blankItem()])} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700">
            <Plus className="h-4 w-4" />
            Add line
          </button>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { uid: uid(), kind: "section", label: "" }])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Heading className="h-4 w-4" />
            Add section heading
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <dl className="w-full max-w-sm space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">{withVat ? "Basic amount (excl. VAT)" : "Total"}</dt>
            <dd className="tabular-nums">{naira(subtotal)}</dd>
          </div>
          {withVat && (
            <div className="flex justify-between">
              <dt className="text-slate-500">VAT @ {vatRatePct}%</dt>
              <dd className="tabular-nums">{naira(vat)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold">
            <dt>{withVat ? "Total incl. VAT" : "Total (no VAT)"}</dt>
            <dd className="tabular-nums">{naira(total)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Payment received (₦)</dt>
            <dd>
              <input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} placeholder="0.00" className={`${input} w-40 text-right`} />
            </dd>
          </div>
          <div className={`flex justify-between rounded-lg px-2 py-1.5 font-semibold ${balance > 0.005 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
            <dt>Balance payment</dt>
            <dd className="tabular-nums">{naira(balance)}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label>
          <span className={label}>Terms &amp; notes (one per line)</span>
          <textarea rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} className={input} />
        </label>
        <div className="grid grid-cols-1 gap-3">
          <label>
            <span className={label}>Prepared by</span>
            <input value={sign.name} onChange={(e) => setSign({ ...sign, name: e.target.value })} className={input} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={label}>Designation</span>
              <input value={sign.designation} onChange={(e) => setSign({ ...sign, designation: e.target.value })} className={input} />
            </label>
            <label>
              <span className={label}>Phone</span>
              <input value={sign.phone} onChange={(e) => setSign({ ...sign, phone: e.target.value })} className={input} />
            </label>
          </div>
          <label>
            <span className={label}>Checked by</span>
            <input value={checkedBy} onChange={(e) => setCheckedBy(e.target.value)} placeholder="Name (optional - or leave for a signature)" className={input} />
          </label>
          <p className="text-xs text-slate-500">The foot of the invoice has Prepared by, Checked by and For Somotex Nigeria Limited (Authorised Signatory).</p>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</p>}
      <div className="flex justify-end">
        <button type="button" disabled={busy} onClick={download} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
          <FileDown className="h-4 w-4" />
          {busy ? "Preparing…" : ref ? "Save & download PDF" : "Download PDF"}
        </button>
      </div>
    </Card>
  );
}
