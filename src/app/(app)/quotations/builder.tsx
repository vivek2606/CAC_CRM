"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, FileDown, FileSpreadsheet, Heading, PackagePlus, PenLine, RotateCcw, Trash2 } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { nairaInWords, serialNumbers, defaultRef } from "@/lib/document-format";
import type { DocumentInput, DocumentType } from "@/lib/sales-document";

export type ModelOption = {
  id: string;
  label: string;
  model: string;
  code: string;
  rate: number | null; // suggested dealer rate, excl. VAT
  stock: number;
  inTransit: number;
  availability: string;
  tentative: boolean;
};
export type CompanyOption = {
  key: string;
  name: string;
  refPrefix: string;
  tin: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
};
export type DealPrefill = {
  dealId: string;
  to: string;
  attention: string;
  title: string;
  terms: string[];
  rows: { productId: string | null; description: string; detail: string; unit: string; qty: number; unitPrice: number }[];
};

type Row =
  | { uid: string; kind: "section"; label: string }
  | { uid: string; kind: "item"; custom: boolean; productId: string | null; description: string; detail: string; unit: string; qty: string; unitPrice: string };

type Draft = {
  type: DocumentType;
  companyKey: string;
  ref: string;
  refEdited: boolean;
  date: string;
  to: string;
  attention: string;
  title: string;
  rows: Row[];
  terms: string;
  validityDays: string;
  tin: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  signatoryName: string;
  signatoryDesignation: string;
  signatoryPhone: string;
};

const DRAFT_KEY = "cac-quotation-draft-v1";
const UNITS = ["No.", "Set", "Lot", "Job", "Pair", "Metre", "Point", "Roll", "Length", "Kg", "Litre", "Day"];
const TYPE_LABELS: Record<DocumentType, string> = { quote: "Quotation", proforma: "Proforma Invoice", boq: "Bill of Quantity" };

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const label = "block text-xs font-medium text-slate-500 mb-1";
const naira = (n: number) => `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: string) => {
  const n = Number(v.replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()));
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Whether a saved draft exists (read without an effect, so it is safe on the
// server render and stays in sync with localStorage).
function useHasSavedDraft(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    () => {
      try {
        return window.localStorage.getItem(DRAFT_KEY) != null;
      } catch {
        return false;
      }
    },
    () => false,
  );
}

export function QuotationBuilder({
  options,
  companies,
  defaultCompany,
  vatRatePct,
  defaultTerms,
  validityDays,
  signatory,
  fromDeal,
  isHead,
}: {
  options: ModelOption[];
  companies: CompanyOption[];
  defaultCompany: string;
  vatRatePct: number;
  defaultTerms: string[];
  validityDays: number;
  signatory: { name: string; designation: string; phone: string };
  fromDeal: DealPrefill | null;
  isHead: boolean;
}) {
  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const companyFor = (key: string) => companies.find((c) => c.key === key) ?? companies[0];

  const fresh = (): Draft => {
    const co = companyFor(defaultCompany);
    const date = todayIso();
    return {
      type: "quote",
      companyKey: co.key,
      ref: defaultRef(co.refPrefix, signatory.name, new Date(`${date}T00:00:00`)),
      refEdited: false,
      date,
      to: fromDeal?.to ?? "",
      attention: fromDeal?.attention ?? "",
      title: fromDeal?.title ?? "SUPPLY OF AIR-CONDITIONING EQUIPMENT",
      rows: fromDeal
        ? fromDeal.rows.map((r, i) => ({ uid: `d${i}`, kind: "item" as const, custom: !r.productId, ...r, qty: String(r.qty), unitPrice: String(r.unitPrice) }))
        : [],
      terms: (fromDeal?.terms ?? defaultTerms).join("\n"),
      validityDays: String(validityDays),
      tin: co.tin,
      bankName: co.bankName,
      accountName: co.accountName,
      accountNumber: co.accountNumber,
      signatoryName: signatory.name,
      signatoryDesignation: signatory.designation,
      signatoryPhone: signatory.phone,
    };
  };

  const [d, setD] = useState<Draft>(fresh);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasSavedDraft = useHasSavedDraft();

  // Keep the work in the browser so leaving the page doesn't lose it.
  useEffect(() => {
    if (!dirty || fromDeal) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      // storage full / blocked - the draft just isn't kept
    }
  }, [d, dirty, fromDeal]);

  const update = (patch: Partial<Draft>) => {
    setDirty(true);
    setD((cur) => {
      const next = { ...cur, ...patch };
      // Ref follows the company prefix and date until typed over.
      if (!next.refEdited && (patch.companyKey !== undefined || patch.date !== undefined)) {
        next.ref = defaultRef(companyFor(next.companyKey).refPrefix, signatory.name, new Date(`${next.date}T00:00:00`));
      }
      return next;
    });
  };
  const setRow = (id: string, patch: Partial<Row>) => update({ rows: d.rows.map((r) => (r.uid === id ? ({ ...r, ...patch } as Row) : r)) });
  const move = (i: number, by: number) => {
    const rows = [...d.rows];
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    update({ rows });
  };
  const addRow = (row: Row) => update({ rows: [...d.rows, row] });

  const restoreDraft = () => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null;
      if (saved?.rows) {
        setD({ ...fresh(), ...saved });
        setDirty(true);
      }
    } catch {
      setError("Couldn't read the saved draft.");
    }
  };
  const startOver = () => {
    if (!window.confirm("Clear this document and start a new one?")) return;
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setD(fresh());
    setDirty(false);
    setError(null);
  };

  const sns = serialNumbers(d.rows);
  const subtotal = d.rows.reduce((s, r) => s + (r.kind === "item" ? Math.round(num(r.qty) * num(r.unitPrice) * 100) / 100 : 0), 0);
  const vat = Math.round(subtotal * vatRatePct) / 100;
  const total = Math.round((subtotal + vat) * 100) / 100;

  const payload = (): DocumentInput => ({
    type: d.type,
    companyKey: d.companyKey,
    ref: d.ref,
    date: d.date,
    to: d.to,
    attention: d.attention,
    title: d.title,
    rows: d.rows.map((r) =>
      r.kind === "section"
        ? { kind: "section", label: r.label }
        : { kind: "item", description: r.description, detail: r.detail, unit: r.unit || "No.", qty: num(r.qty), unitPrice: num(r.unitPrice) },
    ),
    terms: d.terms.split("\n"),
    validityDays: Math.max(0, Math.round(num(d.validityDays))),
    tin: d.tin,
    bankName: d.bankName,
    accountName: d.accountName,
    accountNumber: d.accountNumber,
    signatoryName: d.signatoryName,
    signatoryDesignation: d.signatoryDesignation,
    signatoryPhone: d.signatoryPhone,
  });

  const download = async (format: "pdf" | "xlsx") => {
    setError(null);
    if (!d.rows.some((r) => r.kind === "item" && r.description.trim())) return setError("Add at least one item.");
    setBusy(format);
    try {
      const res = await fetch(`/quotations/${format}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't create the file.");
      }
      const blob = await res.blob();
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `document.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the file.");
    } finally {
      setBusy(null);
    }
  };

  const productOptions = useMemo(() => options.map((o) => ({ id: o.id, label: o.label })), [options]);

  return (
    <div className="space-y-5">
      {!dirty && !fromDeal && hasSavedDraft && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">
          You have an unfinished document saved in this browser.
          <button type="button" onClick={restoreDraft} className="font-medium underline">
            Continue it
          </button>
        </div>
      )}

      {/* Document header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            {(Object.keys(TYPE_LABELS) as DocumentType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => update({ type: t })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${d.type === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <button type="button" onClick={startOver} className="ml-auto inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <RotateCcw className="h-4 w-4" />
            Start over
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className={label}>Issued by</label>
            <select
              value={d.companyKey}
              onChange={(e) => {
                const co = companyFor(e.target.value);
                update({ companyKey: co.key, tin: co.tin, bankName: co.bankName, accountName: co.accountName, accountNumber: co.accountNumber });
              }}
              className={input}
            >
              {companies.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Ref no.</label>
            <input value={d.ref} onChange={(e) => update({ ref: e.target.value, refEdited: true })} className={input} />
          </div>
          <div>
            <label className={label}>Date</label>
            <input type="date" value={d.date} onChange={(e) => update({ date: e.target.value })} className={input} />
          </div>
          <div>
            <label className={label}>Valid for (days)</label>
            <input inputMode="numeric" value={d.validityDays} onChange={(e) => update({ validityDays: e.target.value })} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>To (customer name on the first line, then address / phone)</label>
            <textarea rows={3} value={d.to} onChange={(e) => update({ to: e.target.value })} className={input} />
          </div>
          <div className="sm:col-span-2 space-y-3">
            <div>
              <label className={label}>Kind attention</label>
              <input value={d.attention} onChange={(e) => update({ attention: e.target.value })} className={input} />
            </div>
            <div>
              <label className={label}>Title</label>
              <input value={d.title} onChange={(e) => update({ title: e.target.value })} className={input} />
            </div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
          <h2 className="text-sm font-semibold text-slate-900">Items</h2>
          <p className="text-xs text-slate-500">Rates are excluding VAT. VAT @ {vatRatePct}% is added on the total.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 w-10">S/N</th>
                <th className="px-3 py-2 min-w-[320px]">Model / description</th>
                <th className="px-3 py-2 w-24">Unit</th>
                <th className="px-3 py-2 w-24 text-right">Qty</th>
                <th className="px-3 py-2 w-40 text-right">Rate excl. VAT (₦)</th>
                <th className="px-3 py-2 w-36 text-right">Amount (₦)</th>
                <th className="px-2 py-2 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {d.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                    Add products from the list, custom items (installation, piping…) or a section heading.
                  </td>
                </tr>
              )}
              {d.rows.map((r, i) => {
                const controls = (
                  <td className="px-2 py-2 align-top whitespace-nowrap text-right">
                    <button type="button" title="Move up" onClick={() => move(i, -1)} className="p-1 text-slate-400 hover:text-slate-700">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" title="Move down" onClick={() => move(i, 1)} className="p-1 text-slate-400 hover:text-slate-700">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button type="button" title="Remove" onClick={() => update({ rows: d.rows.filter((x) => x.uid !== r.uid) })} className="p-1 text-slate-400 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                );
                if (r.kind === "section") {
                  return (
                    <tr key={r.uid} className="bg-slate-50/60">
                      <td className="px-3 py-2 font-semibold text-slate-700">{sns[i]}</td>
                      <td colSpan={5} className="px-3 py-2">
                        <input
                          value={r.label}
                          onChange={(e) => setRow(r.uid, { label: e.target.value })}
                          placeholder="Section heading, e.g. VRF Outdoor Unit"
                          className={`${input} font-semibold`}
                        />
                      </td>
                      {controls}
                    </tr>
                  );
                }
                const opt = r.productId ? optionById.get(r.productId) : undefined;
                const amount = num(r.qty) * num(r.unitPrice);
                return (
                  <tr key={r.uid}>
                    <td className="px-3 py-2 align-top text-slate-500 pt-4">{sns[i]}</td>
                    <td className="px-3 py-2 align-top space-y-1.5">
                      {!r.custom && (
                        <SearchableSelect
                          options={productOptions}
                          value={r.productId ?? ""}
                          placeholder="Search model or code…"
                          onSelect={(o) => {
                            const m = o ? optionById.get(o.id) : undefined;
                            setRow(r.uid, m
                              ? { productId: m.id, description: m.model, detail: m.availability, unitPrice: m.rate != null ? String(m.rate) : r.unitPrice }
                              : { productId: null });
                          }}
                        />
                      )}
                      <textarea
                        rows={r.custom ? 2 : 1}
                        value={r.description}
                        onChange={(e) => setRow(r.uid, { description: e.target.value })}
                        placeholder={r.custom ? "e.g. Installation, piping and commissioning of VRF system" : "Description printed on the document"}
                        className={`${input} text-xs`}
                      />
                      <input
                        value={r.detail}
                        onChange={(e) => setRow(r.uid, { detail: e.target.value })}
                        placeholder={r.custom ? "Note (optional), e.g. Copper pipes by client" : "Availability / note, e.g. Available"}
                        className={`${input} text-xs py-1.5`}
                      />
                      {opt && (
                        <p className="text-[11px] text-slate-500">
                          {opt.code && `${opt.code} · `}In stock {opt.stock}
                          {opt.inTransit > 0 && ` · ${opt.inTransit} in transit`}
                          {opt.rate != null
                            ? ` · Suggested ${naira(opt.rate)} excl. VAT${opt.tentative ? " (tentative)" : ""}`
                            : " · No dealer price on file"}
                        </p>
                      )}
                      {r.custom && <p className="text-[11px] text-slate-400">Custom item - not from the product list</p>}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input list="quote-units" value={r.unit} onChange={(e) => setRow(r.uid, { unit: e.target.value })} className={input} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input inputMode="decimal" value={r.qty} onChange={(e) => setRow(r.uid, { qty: e.target.value })} className={`${input} text-right`} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input inputMode="decimal" value={r.unitPrice} onChange={(e) => setRow(r.uid, { unitPrice: e.target.value })} className={`${input} text-right`} />
                      {opt?.rate != null && num(r.unitPrice) !== opt.rate && (
                        <p className="mt-1 text-right text-[11px] text-amber-700">
                          {num(r.unitPrice) < opt.rate ? "Below" : "Above"} suggested by {Math.abs(((num(r.unitPrice) - opt.rate) / opt.rate) * 100).toFixed(1)}%
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top pt-4 text-right tabular-nums font-medium text-slate-800">{naira(amount)}</td>
                    {controls}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="quote-units">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={() => addRow({ uid: uid(), kind: "item", custom: false, productId: null, description: "", detail: "", unit: "No.", qty: "1", unitPrice: "" })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            <PackagePlus className="h-4 w-4" />
            Add product
          </button>
          <button
            type="button"
            onClick={() => addRow({ uid: uid(), kind: "item", custom: true, productId: null, description: "", detail: "", unit: "Lot", qty: "1", unitPrice: "" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <PenLine className="h-4 w-4" />
            Add custom item (installation, piping…)
          </button>
          <button
            type="button"
            onClick={() => addRow({ uid: uid(), kind: "section", label: "" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Heading className="h-4 w-4" />
            Add section heading
          </button>
        </div>
        <div className="border-t border-slate-100 p-4">
          <div className="ml-auto w-full max-w-sm space-y-1 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal (excl. VAT)</span>
              <span className="tabular-nums">{naira(subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>VAT @ {vatRatePct}%</span>
              <span className="tabular-nums">{naira(vat)}</span>
            </div>
            <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-base font-bold text-slate-900">
              <span>Total incl. VAT</span>
              <span className="tabular-nums">{naira(total)}</span>
            </div>
            <p className="pt-1 text-xs text-slate-500">{nairaInWords(total)}</p>
          </div>
        </div>
      </div>

      {/* Terms, bank, signatory */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Terms &amp; conditions</h2>
          <textarea rows={8} value={d.terms} onChange={(e) => update({ terms: e.target.value })} className={`${input} text-xs leading-relaxed`} />
          <p className="mt-1 text-[11px] text-slate-400">One per line. Defaults come from Company Details{isHead ? "" : " (set by the Head of Sales)"}.</p>
        </div>
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Bank details &amp; TIN</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>Bank</label>
                <input value={d.bankName} onChange={(e) => update({ bankName: e.target.value })} className={input} />
              </div>
              <div>
                <label className={label}>Account number</label>
                <input value={d.accountNumber} onChange={(e) => update({ accountNumber: e.target.value })} className={input} />
              </div>
              <div>
                <label className={label}>Account name</label>
                <input value={d.accountName} onChange={(e) => update({ accountName: e.target.value })} className={input} />
              </div>
              <div>
                <label className={label}>TIN</label>
                <input value={d.tin} onChange={(e) => update({ tin: e.target.value })} className={input} />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Signed for {companyFor(d.companyKey).name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={label}>Name</label>
                <input value={d.signatoryName} onChange={(e) => update({ signatoryName: e.target.value })} className={input} />
              </div>
              <div>
                <label className={label}>Designation</label>
                <input value={d.signatoryDesignation} onChange={(e) => update({ signatoryDesignation: e.target.value })} className={input} />
              </div>
              <div>
                <label className={label}>Contact no.</label>
                <input value={d.signatoryPhone} onChange={(e) => update({ signatoryPhone: e.target.value })} className={input} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Downloads */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="text-sm">
          <span className="text-slate-500">{TYPE_LABELS[d.type]} total incl. VAT: </span>
          <span className="font-bold text-slate-900 tabular-nums">{naira(total)}</span>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="ml-auto flex flex-wrap gap-2">
          {fromDeal && (
            <Link href={`/deals/${fromDeal.dealId}`} className="rounded-lg px-3.5 py-2 text-sm text-slate-600 hover:text-slate-900">
              Back to deal
            </Link>
          )}
          <button
            type="button"
            disabled={busy != null}
            onClick={() => download("pdf")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            <FileDown className="h-4 w-4" />
            {busy === "pdf" ? "Preparing PDF…" : "Download PDF"}
          </button>
          <button
            type="button"
            disabled={busy != null}
            onClick={() => download("xlsx")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {busy === "xlsx" ? "Preparing Excel…" : "Download Excel"}
          </button>
        </div>
      </div>
    </div>
  );
}
