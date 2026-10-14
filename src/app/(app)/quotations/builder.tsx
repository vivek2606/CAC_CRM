"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, FileDown, FileSpreadsheet, FileUp, Heading, PackagePlus, PenLine, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { nairaInWords, serialNumbers, isAvailabilityNote, isIssuedQuoteRef, nameInitials } from "@/lib/document-format";
import { reserveQuoteRef, importQuoteSheet } from "./actions";
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
  // Most it may be discounted off the dealer rate, in % (null = no limit).
  maxDiscountPct: number | null;
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
  ownerId: string;
  to: string;
  attention: string;
  title: string;
  terms: string[];
  rows: { productId: string | null; description: string; detail: string; unit: string; qty: number; unitPrice: number }[];
};

// A saved quotation reopened in the builder: as it was (same reference -
// downloading again updates it), or as a revision (a new reference).
export type QuotePrefill = {
  ownerId: string;
  dealId: string | null;
  dealTitle: string | null;
  ref: string;
  revisionOf: string | null;
  data: DocumentInput;
};

type Row =
  | { uid: string; kind: "section"; label: string }
  | {
      uid: string;
      kind: "item";
      custom: boolean;
      productId: string | null;
      description: string;
      detail: string;
      unit: string;
      qty: string;
      unitPrice: string;
      // Supply & installation quotes only. Optional: older drafts lack it.
      installRate?: string;
      // Discount off the (supply) rate, in %. Optional: older drafts lack it.
      discountPct?: string;
    };

type Draft = {
  type: DocumentType;
  // The sales person the quote is for - picked by the Head / Coordinator.
  ownerId?: string;
  companyKey: string;
  ref: string;
  date: string;
  to: string;
  attention: string;
  title: string;
  rows: Row[];
  terms: string[];
  validityDays: string;
  vatMode: "separate" | "inclusive";
  // Optional so drafts saved before this setting existed read as "on".
  showAvailability?: boolean;
  // Supply & installation: adds an Installation rate column.
  withInstallation?: boolean;
  // Sales commission %: product rates are the price-list rate / (1 - it).
  commissionPct?: string;
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
  fromQuote,
  salesPeople,
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
  fromQuote: QuotePrefill | null;
  // Head / Coordinator only: who they can prepare a quote for.
  salesPeople: { id: string; name: string }[] | null;
  // The Head may also quote below an item's permissible discount.
  isHead: boolean;
}) {
  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const companyFor = (key: string) => companies.find((c) => c.key === key) ?? companies[0];

  // The deal a downloaded quote is saved against.
  const linkedDealId = fromDeal?.dealId ?? fromQuote?.dealId ?? null;
  const prefilled = fromDeal != null || fromQuote != null;

  const fromSaved = (q: QuotePrefill): Draft => {
    const x = q.data;
    const byModel = new Map(options.map((o) => [o.model.trim().toLowerCase(), o.id]));
    return {
      type: x.type,
      ownerId: q.ownerId,
      companyKey: companyFor(x.companyKey).key,
      ref: q.ref,
      date: q.revisionOf ? todayIso() : x.date,
      to: x.to,
      attention: x.attention,
      title: x.title,
      rows: x.rows.map((r, i): Row => {
        if (r.kind === "section") return { uid: `q${i}`, kind: "section", label: r.label };
        const productId = byModel.get(r.description.trim().toLowerCase()) ?? null;
        return {
          uid: `q${i}`,
          kind: "item",
          custom: !productId,
          productId,
          description: r.description,
          // A revision picks up today's stock status for listed products.
          detail: q.revisionOf && productId ? (optionById.get(productId)?.availability ?? r.detail) : r.detail,
          unit: r.unit,
          qty: String(r.qty),
          unitPrice: String(r.unitPrice),
          installRate: r.installRate ? String(r.installRate) : "",
          discountPct: r.discountPct ? String(r.discountPct) : "",
        };
      }),
      terms: [...x.terms],
      validityDays: String(x.validityDays),
      vatMode: x.vatMode,
      showAvailability: x.showAvailability,
      withInstallation: x.withInstallation,
      commissionPct: x.commissionPct ? String(x.commissionPct) : "",
      tin: x.tin,
      bankName: x.bankName,
      accountName: x.accountName,
      accountNumber: x.accountNumber,
      signatoryName: q.revisionOf ? signatory.name : x.signatoryName,
      signatoryDesignation: q.revisionOf ? signatory.designation : x.signatoryDesignation,
      signatoryPhone: q.revisionOf ? signatory.phone : x.signatoryPhone,
    };
  };

  const fresh = (): Draft => {
    if (fromQuote) return fromSaved(fromQuote);
    const co = companyFor(defaultCompany);
    const date = todayIso();
    return {
      type: "quote",
      ownerId: fromDeal?.ownerId ?? "",
      companyKey: co.key,
      // A unique reference is issued on the first download (see download()).
      ref: "",
      date,
      to: fromDeal?.to ?? "",
      attention: fromDeal?.attention ?? "",
      title: fromDeal?.title ?? "SUPPLY OF AIR-CONDITIONING EQUIPMENT",
      rows: fromDeal
        ? fromDeal.rows.map((r, i) => ({ uid: `d${i}`, kind: "item" as const, custom: !r.productId, ...r, qty: String(r.qty), unitPrice: String(r.unitPrice) }))
        : [],
      terms: [...(fromDeal?.terms ?? defaultTerms)],
      validityDays: String(validityDays),
      vatMode: "separate",
      showAvailability: true,
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
  // The download was held: a discount is over the limit and went to the Head.
  const [held, setHeld] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<{ summary: string; details: string[] } | null>(null);
  const hasSavedDraft = useHasSavedDraft();

  // Keep the work in the browser so leaving the page doesn't lose it.
  useEffect(() => {
    if (!dirty || prefilled) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      // storage full / blocked - the draft just isn't kept
    }
  }, [d, dirty, prefilled]);

  const update = (patch: Partial<Draft>) => {
    setDirty(true);
    setD((cur) => {
      return { ...cur, ...patch };
    });
  };
  // A reference already issued with another person's initials is replaced
  // (on the next download) when the sales person changes.
  const changeOwner = (ownerId: string) => {
    const name = salesPeople?.find((p) => p.id === ownerId)?.name;
    const initials = isIssuedQuoteRef(d.ref) ? d.ref.split("/")[3] : null;
    update({ ownerId, ...(initials && name && nameInitials(name) !== initials ? { ref: "" } : {}) });
  };
  const setRow = (id: string, patch: Partial<Row>) => update({ rows: d.rows.map((r) => (r.uid === id ? ({ ...r, ...patch } as Row) : r)) });
  const move = (i: number, by: number) => {
    const rows = [...d.rows];
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    update({ rows });
  };
  const moveTerm = (i: number, by: number) => {
    const terms = [...d.terms];
    const j = i + by;
    if (j < 0 || j >= terms.length) return;
    [terms[i], terms[j]] = [terms[j], terms[i]];
    update({ terms });
  };
  const addRow = (row: Row) => update({ rows: [...d.rows, row] });

  const restoreDraft = () => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null;
      if (saved?.rows) {
        // Older drafts kept the terms as one block of text.
        const terms = typeof saved.terms === "string" ? (saved.terms as string).split("\n") : saved.terms;
        setD({ ...fresh(), ...saved, terms });
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

  // A quotation made in Excel: its items come in as rows here (products
  // matched to the list print in the standard format), plus the customer.
  const importExcel = async (file: File) => {
    setError(null);
    setImportNote(null);
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await importQuoteSheet(fd);
      const items = res.rows.filter((r) => r.kind === "item");
      if (items.length === 0) return setError(res.problems[0] ?? "No items found in the sheet.");
      const rows: Row[] = res.rows.map((r): Row => {
        if (r.kind === "section") return { uid: uid(), kind: "section", label: r.label };
        const opt = r.productId ? optionById.get(r.productId) : undefined;
        return opt
          ? { uid: uid(), kind: "item", custom: false, productId: opt.id, description: opt.model, detail: opt.availability, unit: r.unit, qty: String(r.qty), unitPrice: String(r.unitPrice), installRate: r.installRate ? String(r.installRate) : "" }
          : { uid: uid(), kind: "item", custom: true, productId: null, description: r.description, detail: "", unit: r.unit, qty: String(r.qty), unitPrice: String(r.unitPrice), installRate: r.installRate ? String(r.installRate) : "" };
      });
      const hasItems = d.rows.some((r) => r.kind === "item" && r.description.trim());
      const replace = !hasItems || window.confirm("Replace the items already in this quotation?\n\nOK = replace them, Cancel = add the imported items below.");
      const defaultTitle = "SUPPLY OF AIR-CONDITIONING EQUIPMENT";
      update({
        rows: replace ? rows : [...d.rows, ...rows],
        ...(res.to && !d.to.trim() ? { to: res.to } : {}),
        ...(res.attention && !d.attention.trim() ? { attention: res.attention } : {}),
        ...(res.title && (!d.title.trim() || d.title === defaultTitle) ? { title: res.title } : {}),
        ...(res.vatInclusive != null ? { vatMode: res.vatInclusive ? "inclusive" : "separate" } : {}),
        // Installation column: as in the sheet, kept on when adding to a quote that has it.
        withInstallation: res.withInstallation || (!replace && d.withInstallation === true),
      });
      const matched = rows.filter((r) => r.kind === "item" && !r.custom).length;
      const unmatched = res.rows.filter((r, i) => r.kind === "item" && rows[i].kind === "item" && (rows[i] as { custom: boolean }).custom);
      setImportNote({
        summary: `Imported ${items.length} item${items.length === 1 ? "" : "s"} from ${file.name}: ${matched} matched to the product list${
          unmatched.length ? `, ${unmatched.length} added as custom items` : ""
        }. Check the rates, quantities and VAT setting before downloading.`,
        details: [
          ...unmatched.map((r) => `Not in the product list (custom item): ${r.kind === "item" ? r.sourceText || r.description : ""}`),
          ...res.problems,
        ],
      });
    } catch {
      setError("Couldn't import the file.");
    } finally {
      setImporting(false);
    }
  };

  const sns = serialNumbers(d.rows);
  const showAvailability = d.showAvailability !== false;
  const inclusive = d.vatMode === "inclusive";
  const vatFactor = 1 + vatRatePct / 100;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  // The suggested dealer rate is ex-VAT; in inclusive mode it's shown with VAT.
  const suggested = (rate: number) => (inclusive ? round2(rate * vatFactor) : rate);
  // Sales commission built into the rate: price-list rate (excl. VAT) / (1 - commission).
  const commission = Math.min(50, Math.max(0, num(d.commissionPct ?? "")));
  const quoteRate = (rate: number) => round2((inclusive ? rate * vatFactor : rate) / (1 - commission / 100));
  const withInstallation = d.withInstallation === true;
  // Discount %, kept to 0-100; the net rate is the rate less it.
  const discOf = (r: Extract<Row, { kind: "item" }>) => Math.min(100, Math.max(0, num(r.discountPct ?? "")));
  const netRate = (r: Extract<Row, { kind: "item" }>) => round2(num(r.unitPrice) * (1 - discOf(r) / 100));
  // How far below the dealer rate the net rate is, and whether that's over
  // the item's permissible maximum (then the Head has to approve it).
  const overMax = (r: Extract<Row, { kind: "item" }>, opt: ModelOption | undefined) => {
    // (A tentative price isn't a dealer's price - no limit applies to it.)
    if (isHead || !opt || opt.tentative || opt.rate == null || opt.maxDiscountPct == null || !suggested(opt.rate)) return null;
    const off = round2(Math.max(0, (1 - netRate(r) / suggested(opt.rate)) * 100));
    return off > opt.maxDiscountPct + 0.005 ? { off, max: opt.maxDiscountPct } : null;
  };
  // Line amount: qty x net rate, plus installation on supply & installation quotes.
  const lineAmount = (r: Extract<Row, { kind: "item" }>) => Math.round(num(r.qty) * (netRate(r) + (withInstallation ? num(r.installRate ?? "") : 0)) * 100) / 100;
  const overLines = d.rows.filter((r) => r.kind === "item" && overMax(r, r.productId ? optionById.get(r.productId) : undefined)).length;
  const subtotal = d.rows.reduce((s, r) => s + (r.kind === "item" ? lineAmount(r) : 0), 0);
  const installTotal = withInstallation ? d.rows.reduce((s, r) => s + (r.kind === "item" ? Math.round(num(r.qty) * num(r.installRate ?? "") * 100) / 100 : 0), 0) : 0;
  const vat = inclusive ? 0 : Math.round(subtotal * vatRatePct) / 100;
  const total = Math.round((subtotal + vat) * 100) / 100;

  const payload = (ref: string): DocumentInput => ({
    type: d.type,
    companyKey: d.companyKey,
    ref,
    date: d.date,
    to: d.to,
    attention: d.attention,
    title: d.title,
    rows: d.rows.map((r) =>
      r.kind === "section"
        ? { kind: "section", label: r.label }
        : {
            kind: "item",
            productId: !r.custom && r.productId && !r.productId.startsWith("tentative:") ? r.productId : undefined,
            description: r.description,
            detail: r.detail, unit: r.unit || "No.", qty: num(r.qty), unitPrice: num(r.unitPrice), installRate: withInstallation ? num(r.installRate ?? "") : 0,
            discountPct: discOf(r) },
    ),
    terms: d.terms,
    validityDays: Math.max(0, Math.round(num(d.validityDays))),
    vatMode: d.vatMode,
    showAvailability: showAvailability,
    withInstallation,
    commissionPct: commission,
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
    setHeld(null);
    if (!d.rows.some((r) => r.kind === "item" && r.description.trim())) return setError("Add at least one item.");
    if (salesPeople && !d.ownerId) return setError("Pick the sales person this quotation is for.");
    setBusy(format);
    try {
      // The first download issues this quote's unique reference; later
      // downloads of the same quote keep it.
      let ref = d.ref;
      if (!isIssuedQuoteRef(ref)) {
        const issued = await reserveQuoteRef(d.ownerId || null);
        if ("error" in issued) throw new Error(issued.error);
        ref = issued.ref;
        update({ ref });
      }
      const res = await fetch(`/quotations/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(ref), dealId: linkedDealId, ownerId: d.ownerId || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.approval === "pending") return setHeld(body.error);
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
      {fromQuote && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">
          {fromQuote.revisionOf
            ? `Revision of ${fromQuote.revisionOf} - it gets a new reference number when downloaded.`
            : `Saved quotation ${fromQuote.ref} - downloading again keeps this number and saves any changes.`}
          {fromQuote.dealId && (
            <>
              {" "}
              Deal:{" "}
              <Link href={`/deals/${fromQuote.dealId}`} className="font-medium underline">
                {fromQuote.dealTitle}
              </Link>
            </>
          )}
        </div>
      )}
      {!dirty && !prefilled && hasSavedDraft && (
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
        {salesPeople && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-72">
              <label className={label}>Sales person</label>
              <select value={d.ownerId ?? ""} onChange={(e) => changeOwner(e.target.value)} className={input}>
                <option value="">Pick the sales person…</option>
                {salesPeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="pb-2 text-xs text-slate-500">The quotation is saved under this sales person, with their initials in the ref no.</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className={label}>Issued by</label>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 truncate">{companyFor(d.companyKey).name}</p>
          </div>
          <div>
            <label className={label}>Ref no.</label>
            <p
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 truncate"
              title="Unique reference, issued automatically on the first download"
            >
              {isIssuedQuoteRef(d.ref) ? d.ref : <span className="text-slate-400">Issued on first download</span>}
            </p>
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">VAT @ {vatRatePct}%:</span>
            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              {(
                [
                  ["separate", "Show VAT separately"],
                  ["inclusive", "Rates inclusive of VAT"],
                ] as const
              ).map(([mode, text]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    if (mode === d.vatMode) return;
                    // Convert the rates already entered so the totals stay the same.
                    const f = mode === "inclusive" ? vatFactor : 1 / vatFactor;
                    update({
                      vatMode: mode,
                      rows: d.rows.map((r) =>
                        r.kind === "item"
                          ? {
                              ...r,
                              unitPrice: r.unitPrice.trim() !== "" ? String(round2(num(r.unitPrice) * f)) : r.unitPrice,
                              installRate: (r.installRate ?? "").trim() !== "" ? String(round2(num(r.installRate ?? "") * f)) : r.installRate,
                            }
                          : r,
                      ),
                    });
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${d.vatMode === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {text}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600" title="Product rates become the price-list rate (excl. VAT) / (1 - commission). Not printed on the document.">
              Sales commission %
              <input
                inputMode="decimal"
                value={d.commissionPct ?? ""}
                placeholder="0"
                onChange={(e) => {
                  // Re-price the product lines: rate x (1 - old) / (1 - new), so
                  // a rate already changed by hand keeps its change.
                  const next = Math.min(50, Math.max(0, num(e.target.value)));
                  const f = (1 - commission / 100) / (1 - next / 100);
                  update({
                    commissionPct: e.target.value,
                    rows: d.rows.map((r) =>
                      r.kind === "item" && !r.custom && r.unitPrice.trim() !== "" && f !== 1 ? { ...r, unitPrice: String(round2(num(r.unitPrice) * f)) } : r,
                    ),
                  });
                }}
                className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={showAvailability}
                onChange={(e) => update({ showAvailability: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Show product availability on the document
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={withInstallation}
                onChange={(e) => update({ withInstallation: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Supply &amp; installation (adds an installation rate column)
            </label>
          </div>
        </div>
        {/* Phones: one card per line, with big quantity / rate boxes. */}
        <div className="md:hidden divide-y divide-slate-100 border-t border-slate-100">
          {d.rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">Add products, custom items or a section heading below - or import a quotation made in Excel.</p>}
          {d.rows.map((r, i) => {
            const tools = (
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="rounded-md p-2 text-slate-400 active:bg-slate-100">
                  <ArrowUp className="h-5 w-5" />
                </button>
                <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="rounded-md p-2 text-slate-400 active:bg-slate-100">
                  <ArrowDown className="h-5 w-5" />
                </button>
                <button type="button" aria-label="Remove" onClick={() => update({ rows: d.rows.filter((x) => x.uid !== r.uid) })} className="rounded-md p-2 text-slate-400 active:bg-rose-50 active:text-rose-600">
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            );
            if (r.kind === "section") {
              return (
                <div key={r.uid} className="bg-slate-50/60 px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Section {sns[i]}</span>
                    {tools}
                  </div>
                  <input value={r.label} onChange={(e) => setRow(r.uid, { label: e.target.value })} placeholder="Section heading, e.g. VRF Outdoor Unit" className={`${input} text-base font-semibold`} />
                </div>
              );
            }
            const opt = r.productId ? optionById.get(r.productId) : undefined;
            const amount = lineAmount(r);
            const big = "w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500";
            return (
              <div key={r.uid} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">
                    Item {sns[i]}
                    {r.custom && " · custom"}
                  </span>
                  {tools}
                </div>
                {!r.custom && (
                  <SearchableSelect
                    options={productOptions}
                    value={r.productId ?? ""}
                    placeholder="Search model or code…"
                    onSelect={(o) => {
                      const m = o ? optionById.get(o.id) : undefined;
                      setRow(r.uid, m ? { productId: m.id, description: m.model, detail: m.availability, unitPrice: m.rate != null ? String(quoteRate(m.rate)) : r.unitPrice } : { productId: null });
                    }}
                  />
                )}
                <textarea
                  rows={2}
                  value={r.description}
                  onChange={(e) => setRow(r.uid, { description: e.target.value })}
                  placeholder={r.custom ? "e.g. Installation, piping and commissioning" : "Description printed on the document"}
                  className={`${input} text-base`}
                />
                <input
                  value={r.detail}
                  onChange={(e) => setRow(r.uid, { detail: e.target.value })}
                  placeholder={r.custom ? "Note (optional)" : "Availability / note"}
                  className={`${input} text-base ${!showAvailability && isAvailabilityNote(r.detail) ? "line-through text-slate-400" : ""}`}
                />
                {opt && (
                  <p className="text-xs text-slate-500">
                    In stock {opt.stock}
                    {opt.inTransit > 0 && ` · ${opt.inTransit} in transit`}
                    {opt.rate != null ? ` · Suggested ${naira(quoteRate(opt.rate))}${commission ? ` (price list ${naira(suggested(opt.rate))} + ${commission}% commission)` : ""}` : " · No dealer price on file"}
                  </p>
                )}
                <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Unit</span>
                    <input list="quote-units" value={r.unit} onChange={(e) => setRow(r.uid, { unit: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Qty</span>
                    <input inputMode="decimal" enterKeyHint="next" value={r.qty} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setRow(r.uid, { qty: e.target.value })} className={big} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Rate {inclusive ? "incl." : "excl."} VAT (₦)</span>
                    <input inputMode="decimal" enterKeyHint={withInstallation ? "next" : "done"} value={r.unitPrice} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setRow(r.uid, { unitPrice: e.target.value })} className={big} />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Discount %{opt?.maxDiscountPct != null ? ` (max ${opt.maxDiscountPct}%)` : ""}
                  </span>
                  <input inputMode="decimal" value={r.discountPct ?? ""} placeholder="0" onFocus={(e) => e.currentTarget.select()} onChange={(e) => setRow(r.uid, { discountPct: e.target.value })} className={big} />
                  {discOf(r) > 0 && <span className="mt-1 block text-xs text-slate-500">Net rate {naira(inclusive ? round2(netRate(r) / vatFactor) : netRate(r))} excl. VAT</span>}
                  {(() => {
                    const o = overMax(r, opt);
                    return o ? <span className="mt-1 block text-xs font-medium text-rose-700">{o.off}% off the dealer rate - over the {o.max}% maximum; only the Head of Sales can quote this</span> : null;
                  })()}
                </label>
                {withInstallation && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Installation rate {inclusive ? "incl." : "excl."} VAT (₦)</span>
                    <input inputMode="decimal" enterKeyHint="done" value={r.installRate ?? ""} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setRow(r.uid, { installRate: e.target.value })} className={big} />
                  </label>
                )}
                <p className="text-right text-sm text-slate-600">
                  Amount <span className="font-semibold text-slate-900 tabular-nums">{naira(amount)}</span>
                </p>
              </div>
            );
          })}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2 min-w-[320px]">Model / description</th>
                <th className="px-3 py-2 w-24">Unit</th>
                <th className="px-3 py-2 w-24 text-right">Qty</th>
                <th className="px-3 py-2 w-40 text-right">
                  {withInstallation ? "Supply rate" : "Rate"} {inclusive ? "incl." : "excl."} VAT (₦)
                </th>
                <th className="px-3 py-2 w-28 text-right">Disc. %</th>
                {withInstallation && <th className="px-3 py-2 w-36 text-right">Installation rate (₦)</th>}
                <th className="px-3 py-2 w-36 text-right">Amount (₦)</th>
                <th className="px-2 py-2 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {d.rows.length === 0 && (
                <tr>
                  <td colSpan={withInstallation ? 9 : 8} className="px-3 py-8 text-center text-sm text-slate-500">
                    Add products from the list, custom items (installation, piping…) or a section heading - or import a quotation made in Excel.
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
                      <td colSpan={withInstallation ? 7 : 6} className="px-3 py-2">
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
                const amount = lineAmount(r);
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
                              ? { productId: m.id, description: m.model, detail: m.availability, unitPrice: m.rate != null ? String(quoteRate(m.rate)) : r.unitPrice }
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
                        className={`${input} text-xs py-1.5 ${!showAvailability && isAvailabilityNote(r.detail) ? "line-through text-slate-400" : ""}`}
                        title={!showAvailability && isAvailabilityNote(r.detail) ? "Availability is switched off - not printed on the document" : undefined}
                      />
                      {opt && (
                        <p className="text-[11px] text-slate-500">
                          {opt.code && `${opt.code} · `}In stock {opt.stock}
                          {opt.inTransit > 0 && ` · ${opt.inTransit} in transit`}
                          {opt.rate != null
                            ? ` · Suggested ${naira(quoteRate(opt.rate))} ${inclusive ? "incl." : "excl."} VAT${opt.tentative ? " (tentative)" : ""}${commission ? ` - price list ${naira(suggested(opt.rate))} + ${commission}% commission` : ""}`
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
                      {opt?.rate != null && Math.abs(num(r.unitPrice) - quoteRate(opt.rate)) >= 0.01 && (
                        <p className="mt-1 text-right text-[11px] text-amber-700">
                          {num(r.unitPrice) < quoteRate(opt.rate) ? "Below" : "Above"} suggested by{" "}
                          {Math.abs(((num(r.unitPrice) - quoteRate(opt.rate)) / quoteRate(opt.rate)) * 100).toFixed(1)}%
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        inputMode="decimal"
                        value={r.discountPct ?? ""}
                        placeholder="0"
                        onChange={(e) => setRow(r.uid, { discountPct: e.target.value })}
                        className={`${input} text-right ${overMax(r, opt) ? "border-rose-400 bg-rose-50" : ""}`}
                      />
                      {discOf(r) > 0 && (
                        <p className="mt-1 text-right text-[11px] text-slate-500">
                          Net {naira(inclusive ? round2(netRate(r) / vatFactor) : netRate(r))} excl. VAT
                        </p>
                      )}
                      {opt?.maxDiscountPct != null && <p className="mt-0.5 text-right text-[11px] text-slate-400">Max {opt.maxDiscountPct}%</p>}
                      {(() => {
                        const o = overMax(r, opt);
                        return o ? (
                          <p className="mt-0.5 text-right text-[11px] font-medium text-rose-700" title="Over the permissible discount - only the Head of Sales can prepare this quote">
                            {o.off}% off - over max
                          </p>
                        ) : null;
                      })()}
                    </td>
                    {withInstallation && (
                      <td className="px-3 py-2 align-top">
                        <input inputMode="decimal" value={r.installRate ?? ""} onChange={(e) => setRow(r.uid, { installRate: e.target.value })} className={`${input} text-right`} />
                      </td>
                    )}
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
          <label
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 ${importing ? "opacity-60" : ""}`}
            title="Upload a quotation made in Excel - its items are brought in here in the standard format"
          >
            <FileUp className="h-4 w-4" />
            {importing ? "Importing…" : "Import from Excel"}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) importExcel(f);
              }}
            />
          </label>
        </div>
        {importNote && (
          <div className="mx-4 mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <div className="flex items-start gap-2">
              <p className="flex-1">{importNote.summary}</p>
              <button type="button" onClick={() => setImportNote(null)} aria-label="Dismiss" className="text-emerald-700 hover:text-emerald-900">
                <X className="h-4 w-4" />
              </button>
            </div>
            {importNote.details.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-amber-800">
                {importNote.details.slice(0, 15).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
                {importNote.details.length > 15 && <li>…and {importNote.details.length - 15} more</li>}
              </ul>
            )}
          </div>
        )}
        <div className="border-t border-slate-100 p-4">
          <div className="ml-auto w-full max-w-sm space-y-1 text-sm">
            {withInstallation && (
              <>
                <div className="flex justify-between text-slate-500">
                  <span>Supply</span>
                  <span className="tabular-nums">{naira(subtotal - installTotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Installation</span>
                  <span className="tabular-nums">{naira(installTotal)}</span>
                </div>
              </>
            )}
            {!inclusive && (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal (excl. VAT)</span>
                  <span className="tabular-nums">{naira(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>VAT @ {vatRatePct}%</span>
                  <span className="tabular-nums">{naira(vat)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-base font-bold text-slate-900">
              <span>{inclusive ? `Total inclusive of VAT (@${vatRatePct}%)` : "Total incl. VAT"}</span>
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
          <ol className="space-y-2">
            {d.terms.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="pt-2 text-xs text-slate-400 w-4 text-right">{i + 1}.</span>
                <textarea
                  rows={Math.max(1, Math.ceil(t.length / 52))}
                  value={t}
                  onChange={(e) => update({ terms: d.terms.map((x, j) => (j === i ? e.target.value : x)) })}
                  placeholder="e.g. Warranty - One year from the date of Supply of Goods."
                  className={`${input} text-xs py-1.5`}
                />
                <div className="flex shrink-0 pt-1">
                  <button type="button" title="Move up" onClick={() => moveTerm(i, -1)} className="p-1 text-slate-400 hover:text-slate-700">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" title="Move down" onClick={() => moveTerm(i, 1)} className="p-1 text-slate-400 hover:text-slate-700">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" title="Remove" onClick={() => update({ terms: d.terms.filter((_, j) => j !== i) })} className="p-1 text-slate-400 hover:text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => update({ terms: [...d.terms, ""] })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Add term
            </button>
            <button type="button" onClick={() => update({ terms: [...defaultTerms] })} className="text-sm text-slate-500 hover:text-slate-800">
              Reset to default terms
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Changes apply to this document only. The default terms are set under Company Details{isHead ? "" : " by the Head of Sales"}.
          </p>
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
        {held && <p className="basis-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 order-last">{held}</p>}
        {!held && overLines > 0 && (
          <p className="text-sm text-rose-700">
            Can&apos;t be generated: {overLines} line{overLines === 1 ? " is" : "s are"} below the permissible discount - only the Head of Sales can prepare
            such a quote. Download sends it to the Head of Sales instead; or bring the discount within the limit.
          </p>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {linkedDealId && (
            <Link href={`/deals/${linkedDealId}`} className="rounded-lg px-3.5 py-2 text-sm text-slate-600 hover:text-slate-900">
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
