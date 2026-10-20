"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, FileDown, FileSpreadsheet, FileUp, Heading, PackagePlus, PenLine, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { nairaInWords, serialNumbers, isAvailabilityNote, isIssuedQuoteRef, nameInitials } from "@/lib/document-format";
import { reserveQuoteRef, importQuoteSheet, createDealForQuote, saveQuoteDraft, discardQuoteDraft } from "./actions";
import type { DocumentInput, DocumentType } from "@/lib/sales-document";
import { combinedOutdoorIn, kW, vrfModelName } from "@/lib/modular-outdoor";
import { ModularOutdoorDialog, type ModularModule } from "./modular-outdoor-dialog";

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
  // Most it may be discounted off the dealer rate, in % - sent to the Head
  // only (shown as a hint); the check itself runs on the server.
  maxDiscountPct: number | null;
};
// Not in stock and quoted at the tentative price: no discount allowed.
const noDiscount = (o: ModelOption | undefined) => !!o && o.stock <= 0 && o.tentative;
const has = (v: string | undefined) => (v ?? "").trim() !== "";
// A margin of 100% or more has no price; kept to 0-90.
const clampMargin = (m: number) => Math.min(90, Math.max(0, m));

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
  // Opened from a saved draft (not downloaded yet): its id.
  draftId?: string | null;
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
      // Pricing from costs (installation quotes from a contractor's bill):
      // our cost for the supply / installation rate (excl. VAT) and the
      // margin % for this line (blank = the quote's margin). With a cost,
      // the rate is cost / (1 - margin) - never printed.
      costRate?: string;
      costInstall?: string;
      marginPct?: string;
      // A modular VRF outdoor: the modules it's made of, each with its rate
      // (same basis as unitPrice); unitPrice is their sum.
      modules?: ModularModule[];
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
  // Rates from costs + margin (see Row.costRate); marginPct is the default.
  costing?: boolean;
  marginPct?: string;
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
  dealOwners,
  myId,
  isHead,
  canExcel,
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
  // Head / Coordinator: the sales people a deal made from the quote can go to.
  dealOwners: { id: string; name: string }[] | null;
  myId: string;
  // The Head may also quote below an item's permissible discount.
  isHead: boolean;
  // Not the Sales Coordinator: she downloads the PDF only.
  canExcel: boolean;
}) {
  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const companyFor = (key: string) => companies.find((c) => c.key === key) ?? companies[0];

  // The deal a downloaded quote is saved against.
  // A deal made for this quote after it was downloaded (see the prompt below).
  const [createdDealId, setCreatedDealId] = useState<string | null>(null);
  // The saved draft this is (Save draft); gone once downloaded.
  const [draftId, setDraftId] = useState<string | null>(fromQuote?.draftId ?? null);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const linkedDealId = fromDeal?.dealId ?? fromQuote?.dealId ?? createdDealId;
  // Downloaded without a deal: prompt to create one and link it.
  const [unlinkedRef, setUnlinkedRef] = useState<string | null>(null);
  const [dealTitle, setDealTitle] = useState("");
  // Who the deal goes to (Head / Coordinator): the quote's sales person when
  // that's a sales person; the Head defaults to themself, the Coordinator
  // must pick.
  const [dealOwner, setDealOwner] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
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
          costRate: r.costRate != null ? String(r.costRate) : "",
          costInstall: r.costInstall != null ? String(r.costInstall) : "",
          marginPct: r.marginPct != null ? String(r.marginPct) : "",
          ...(r.modules?.length ? { custom: true, productId: null, modules: r.modules.map((m) => ({ productId: m.productId, model: m.model, rate: String(m.rate) })) } : {}),
        };
      }),
      terms: [...x.terms],
      validityDays: String(x.validityDays),
      vatMode: x.vatMode,
      showAvailability: x.showAvailability,
      withInstallation: x.withInstallation,
      commissionPct: x.commissionPct ? String(x.commissionPct) : "",
      costing: x.costing,
      marginPct: x.marginPct ? String(x.marginPct) : "",
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
  const [busy, setBusy] = useState<"pdf" | "xlsx" | "costing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The download was held: a discount is over the limit and went to the Head.
  const [held, setHeld] = useState<string | null>(null);
  // The customer's name is required - flagged once a download is tried without it.
  const [triedDownload, setTriedDownload] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<{ summary: string; details: string[] } | null>(null);
  // The modular-outdoor dialog: for which line, and the model typed.
  const [modular, setModular] = useState<{ uid: string; series: string | null; code: number; modules?: ModularModule[] } | null>(null);
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
    // No one picked: the quote is the preparer's own.
    const name = ownerId ? salesPeople?.find((p) => p.id === ownerId)?.name : signatory.name;
    const initials = isIssuedQuoteRef(d.ref) ? d.ref.split("/")[3] : null;
    update({ ownerId, ...(initials && name && nameInitials(name) !== initials ? { ref: "" } : {}) });
  };
  // A line priced from its cost is re-priced whenever it changes.
  const setRow = (id: string, patch: Partial<Row>) =>
    update({ rows: d.rows.map((r) => (r.uid === id ? reprice({ ...r, ...patch } as Row, defaultMargin, inclusive) : r)) });
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
  // Save without downloading (it's saved anyway once downloaded).
  const saveDraft = async () => {
    setError(null);
    setDraftNote(null);
    if (!d.rows.some((r) => r.kind === "item" && r.description.trim()) && !d.to.trim()) return setError("Add the customer or an item before saving.");
    setSavingDraft(true);
    const res = await saveQuoteDraft(payload(""), { draftId, dealId: linkedDealId, ownerId: d.ownerId || null });
    setSavingDraft(false);
    if (res.error) return setError(res.error);
    setDraftId(res.draftId ?? null);
    setDraftNote(`Draft saved ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} - find it under Saved quotations → Drafts.`);
  };
  // Throw away what's been prepared (and its saved draft, if any).
  const discard = async () => {
    if (!window.confirm(draftId ? "Discard this quotation and its saved draft?" : "Discard this quotation?")) return;
    if (draftId) {
      const res = await discardQuoteDraft(draftId);
      if (res.error) return setError(res.error);
      setDraftId(null);
    }
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setD(fresh());
    setDirty(false);
    setError(null);
    setDraftNote(null);
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
  // asCost: a contractor's installation bill - every line's supply and
  // installation rates are our costs, and the quote's rates are worked out
  // from them with the margin.
  const importExcel = async (file: File, asCost = false) => {
    setError(null);
    setImportNote(null);
    let margin = defaultMargin;
    if (asCost && !has(d.marginPct)) {
      const answer = window.prompt("Margin % to add to the bill's rates (margin on our price, not markup):", "20");
      if (answer == null) return;
      margin = clampMargin(num(answer));
    }
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
      if (asCost) {
        // As written on the bill (no product matching), every rate a cost.
        rows.splice(
          0,
          rows.length,
          ...res.rows.map((src, i): Row => {
            if (src.kind === "section") return rows[i];
            return reprice(
              {
                uid: uid(),
                kind: "item",
                custom: true,
                productId: null,
                description: src.sourceText || src.description,
                detail: "",
                unit: src.unit,
                qty: String(src.qty),
                unitPrice: "",
                installRate: "",
                costRate: src.unitPrice > 0 ? String(src.unitPrice) : "",
                costInstall: src.installRate > 0 ? String(src.installRate) : "",
              },
              margin,
              inclusive,
            );
          }),
        );
      }
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
        ...(asCost ? { costing: true, marginPct: String(margin) } : {}),
      });
      const matched = rows.filter((r) => r.kind === "item" && !r.custom).length;
      const unmatched = res.rows.filter((r, i) => r.kind === "item" && rows[i].kind === "item" && (rows[i] as { custom: boolean }).custom);
      setImportNote({
        summary: asCost
          ? `Imported ${items.length} item${items.length === 1 ? "" : "s"} from ${file.name}. Every rate on the bill (supply and installation) is our cost, priced at ${margin}% margin - change the Margin % above to re-price. Check the quantities and VAT setting before downloading.`
          : `Imported ${items.length} item${items.length === 1 ? "" : "s"} from ${file.name}: ${matched} matched to the product list${
              unmatched.length ? `, ${unmatched.length} added as custom items` : ""
            }. Check the rates, quantities and VAT setting before downloading.`,
        details: [
          ...(asCost ? [] : unmatched.map((r) => `Not in the product list (custom item): ${r.kind === "item" ? r.sourceText || r.description : ""}`)),
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
  const missingCustomer = triedDownload && !d.to.split("\n")[0]?.trim();
  const showAvailability = d.showAvailability !== false;
  const inclusive = d.vatMode === "inclusive";
  const vatFactor = 1 + vatRatePct / 100;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  // The suggested dealer rate is ex-VAT; in inclusive mode it's shown with VAT.
  const suggested = (rate: number) => (inclusive ? round2(rate * vatFactor) : rate);
  // Sales commission built into the rate: price-list rate (excl. VAT) / (1 - commission).
  const commission = Math.min(50, Math.max(0, num(d.commissionPct ?? "")));
  const quoteRate = (rate: number) => round2((inclusive ? rate * vatFactor : rate) / (1 - commission / 100));
  // Margin (not markup): the rate is cost / (1 - margin), so the margin is
  // that share of our price. Rounded up to the naira, so it's never short.
  const defaultMargin = clampMargin(num(d.marginPct ?? ""));
  const marginOf = (r: Extract<Row, { kind: "item" }>) => (has(r.marginPct) ? clampMargin(num(r.marginPct ?? "")) : defaultMargin);
  const priceFromCost = (cost: number, margin: number, incl: boolean) => Math.ceil((cost / (1 - margin / 100)) * (incl ? vatFactor : 1));
  const reprice = (r: Row, margin: number, incl: boolean): Row => {
    if (r.kind !== "item" || (!has(r.costRate) && !has(r.costInstall))) return r;
    const m = has(r.marginPct) ? clampMargin(num(r.marginPct ?? "")) : margin;
    return {
      ...r,
      ...(has(r.costRate) ? { unitPrice: String(priceFromCost(num(r.costRate ?? ""), m, incl)) } : {}),
      ...(has(r.costInstall) ? { installRate: String(priceFromCost(num(r.costInstall ?? ""), m, incl)) } : {}),
    };
  };
  const withInstallation = d.withInstallation === true;
  // Discount %, kept to 0-100; the net rate is the rate less it.
  // Not in stock at the tentative rate: no discount at all.
  const discOf = (r: Extract<Row, { kind: "item" }>) =>
    noDiscount(r.productId ? optionById.get(r.productId) : undefined) ? 0 : Math.min(100, Math.max(0, num(r.discountPct ?? "")));
  const netRate = (r: Extract<Row, { kind: "item" }>) => round2(num(r.unitPrice) * (1 - discOf(r) / 100));
  // Line amount: qty x net rate, plus installation on supply & installation quotes.
  const lineAmount = (r: Extract<Row, { kind: "item" }>) => Math.round(num(r.qty) * (netRate(r) + (withInstallation ? num(r.installRate ?? "") : 0)) * 100) / 100;
  const subtotal = d.rows.reduce((s, r) => s + (r.kind === "item" ? lineAmount(r) : 0), 0);
  // Costed lines: our cost, and our price for the costed parts (excl. VAT).
  const costOf = (r: Extract<Row, { kind: "item" }>) =>
    num(r.qty) * ((has(r.costRate) ? num(r.costRate ?? "") : 0) + (withInstallation && has(r.costInstall) ? num(r.costInstall ?? "") : 0));
  const pricedOf = (r: Extract<Row, { kind: "item" }>) =>
    (num(r.qty) * ((has(r.costRate) ? netRate(r) : 0) + (withInstallation && has(r.costInstall) ? num(r.installRate ?? "") : 0))) / (inclusive ? vatFactor : 1);
  const marginPctOf = (cost: number, price: number) => (price > 0 ? ((price - cost) / price) * 100 : null);
  const costItems = d.rows.filter((r): r is Extract<Row, { kind: "item" }> => r.kind === "item" && (has(r.costRate) || has(r.costInstall)));
  const costTotal = round2(costItems.reduce((t, r) => t + costOf(r), 0));
  const pricedTotal = round2(costItems.reduce((t, r) => t + pricedOf(r), 0));
  const costBlock = (r: Extract<Row, { kind: "item" }>) => {
    const actual = marginPctOf(costOf(r), pricedOf(r));
    const small = "w-24 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-right text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500";
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-200 bg-amber-50/70 px-2 py-1.5 text-[11px] text-slate-600">
        <span className="font-semibold text-amber-800">Our cost (not printed)</span>
        <label className="inline-flex items-center gap-1">
          {withInstallation ? "Supply" : "Rate"} ₦
          <input inputMode="decimal" value={r.costRate ?? ""} placeholder="-" onChange={(e) => setRow(r.uid, { costRate: e.target.value })} className={small} />
        </label>
        {withInstallation && (
          <label className="inline-flex items-center gap-1">
            Installation ₦
            <input inputMode="decimal" value={r.costInstall ?? ""} placeholder="-" onChange={(e) => setRow(r.uid, { costInstall: e.target.value })} className={small} />
          </label>
        )}
        <label className="inline-flex items-center gap-1" title="Blank = the quote's margin">
          Margin %
          <input inputMode="decimal" value={r.marginPct ?? ""} placeholder={String(defaultMargin)} onChange={(e) => setRow(r.uid, { marginPct: e.target.value })} className="w-14 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-right text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </label>
        {actual != null && costOf(r) > 0 && (
          <span className={actual + 0.05 < marginOf(r) ? "font-semibold text-rose-700" : "text-emerald-700"}>
            Margin {actual.toFixed(1)}%{actual + 0.05 < marginOf(r) ? " - below target (discount?)" : ""}
          </span>
        )}
      </div>
    );
  };
  // Typing a combined VRF outdoor (e.g. "2250W") in a product search offers
  // to make it up from modules.
  const modularAction = (uid: string) => (q: string) => {
    const v = combinedOutdoorIn(q);
    return v
      ? { label: `Modular outdoor ${vrfModelName(v.series ?? "MVC", v.code)} - ${kW(v.code)} kW: choose its modules…`, run: () => setModular({ uid, series: v.series, code: v.code }) }
      : null;
  };
  const modularNote = (r: Extract<Row, { kind: "item" }>) => (
    <p className="text-[11px] text-indigo-700">
      Modular outdoor: {r.modules!.map((m) => `${m.model} (${naira(num(m.rate))})`).join(" + ")}{" "}
      <button
        type="button"
        onClick={() => {
          const v = combinedOutdoorIn(r.description);
          setModular({ uid: r.uid, series: v?.series ?? null, code: v?.code ?? 0, modules: r.modules });
        }}
        className="font-medium underline hover:text-indigo-900"
      >
        Edit modules
      </button>
    </p>
  );
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
            discountPct: discOf(r),
            ...(has(r.costRate) ? { costRate: num(r.costRate ?? "") } : {}),
            ...(has(r.costInstall) ? { costInstall: num(r.costInstall ?? "") } : {}),
            ...(has(r.marginPct) ? { marginPct: clampMargin(num(r.marginPct ?? "")) } : {}),
            ...(r.modules?.length ? { modules: r.modules.map((m) => ({ productId: m.productId, model: m.model, rate: num(m.rate) })) } : {}) },
    ),
    terms: d.terms,
    validityDays: Math.max(0, Math.round(num(d.validityDays))),
    vatMode: d.vatMode,
    showAvailability: showAvailability,
    withInstallation,
    commissionPct: commission,
    costing: d.costing === true,
    marginPct: defaultMargin,
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
    if (!d.to.split("\n")[0]?.trim()) {
      setTriedDownload(true);
      return setError("Enter the customer's name (first line of \"To\").");
    }
    if (!d.rows.some((r) => r.kind === "item" && r.description.trim())) return setError("Add at least one item.");
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
        body: JSON.stringify({ ...payload(ref), dealId: linkedDealId, ownerId: d.ownerId || null, draftId }),
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
      // Downloaded = saved as the quotation; the draft it came from is gone.
      if (draftId) {
        setDraftId(null);
        setDraftNote(null);
      }
      if (!linkedDealId) {
        setUnlinkedRef(ref);
        if (dealOwners) setDealOwner((cur) => cur || (dealOwners.some((o) => o.id === d.ownerId) ? d.ownerId! : isHead ? myId : ""));
        setDealTitle((t) => t || [d.to.split("\n")[0]?.trim(), d.title.trim()].filter(Boolean).join(" - ").slice(0, 200));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the file.");
    } finally {
      setBusy(null);
    }
  };

  // The internal costing sheet (costs, margins, our rates) - built from the
  // form as it is; no reference issued, nothing saved.
  const downloadCosting = async () => {
    setError(null);
    setBusy("costing");
    try {
      const res = await fetch("/quotations/costing-xlsx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(d.ref)) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't create the costing sheet.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "Costing.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the costing sheet.");
    } finally {
      setBusy(null);
    }
  };

  // In stock first, then in transit, then the rest - so when a model is
  // under several codes, the code with stock is the first suggestion.
  const productOptions = useMemo(() => {
    const rank = (o: ModelOption) => (o.stock > 0 ? 0 : o.inTransit > 0 ? 1 : 2);
    const qty = (n: number) => n.toLocaleString("en-NG", { maximumFractionDigits: 2 });
    return options
      .map((o, i) => ({ o, i }))
      .sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i)
      .map(({ o }) => ({
        id: o.id,
        label: o.label,
        hint: o.stock > 0 ? `${qty(o.stock)} in stock` : o.inTransit > 0 ? `${qty(o.inTransit)} in transit` : o.tentative ? "tentative price" : "no stock",
        hintTone: o.stock > 0 ? ("good" as const) : ("muted" as const),
      }));
  }, [options]);

  return (
    <div className="space-y-5">
      {modular && (
        <ModularOutdoorDialog
          options={options}
          rateFor={(o) => (o.rate != null ? quoteRate(o.rate) : null)}
          initial={modular}
          onConfirm={(res) => {
            setRow(modular.uid, { custom: true, productId: null, description: res.description, detail: "", unitPrice: String(res.total), modules: res.modules, discountPct: "" });
            setModular(null);
          }}
          onCancel={() => setModular(null)}
        />
      )}
      {fromQuote && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">
          {fromQuote.draftId
            ? "Saved draft - not downloaded yet. It gets its quotation number when downloaded; Save draft keeps your changes, Discard throws it away."
            : fromQuote.revisionOf
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
                <option value="">None - my own quotation</option>
                {salesPeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="pb-2 text-xs text-slate-500">
              The quotation is saved under this sales person, with their initials in the ref no. Left on &quot;None&quot;, it is saved under your name.
            </p>
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
            <label className={label}>
              To - customer name on the first line <span className="text-rose-600">*</span> (then address / phone)
            </label>
            <textarea
              rows={3}
              value={d.to}
              onChange={(e) => update({ to: e.target.value })}
              placeholder="Customer name (required)"
              className={`${input} ${missingCustomer ? "border-rose-400 bg-rose-50" : ""}`}
            />
            {missingCustomer && <p className="mt-1 text-xs text-rose-600">Enter the customer&apos;s name - a quotation can&apos;t be downloaded without it.</p>}
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
                          ? reprice(
                              {
                                ...r,
                                unitPrice: r.unitPrice.trim() !== "" ? String(round2(num(r.unitPrice) * f)) : r.unitPrice,
                                installRate: (r.installRate ?? "").trim() !== "" ? String(round2(num(r.installRate ?? "") * f)) : r.installRate,
                                ...(r.modules ? { modules: r.modules.map((m) => ({ ...m, rate: String(round2(num(m.rate) * f)) })) } : {}),
                              },
                              defaultMargin,
                              mode === "inclusive",
                            )
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
                    rows: d.rows.map((r) => {
                      if (r.kind !== "item" || f === 1) return r;
                      // A modular outdoor's modules are product rates too.
                      if (r.modules?.length) {
                        const modules = r.modules.map((m) => ({ ...m, rate: String(round2(num(m.rate) * f)) }));
                        return { ...r, modules, unitPrice: String(round2(modules.reduce((t, m) => t + num(m.rate), 0))) };
                      }
                      return !r.custom && !has(r.costRate) && r.unitPrice.trim() !== "" ? { ...r, unitPrice: String(round2(num(r.unitPrice) * f)) } : r;
                    }),
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
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600" title="Each line takes our cost; the rate is cost / (1 - margin). Costs and margin are not printed.">
              <input
                type="checkbox"
                checked={d.costing === true}
                onChange={(e) => update({ costing: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Price from our costs + margin
            </label>
            {d.costing && (
              <label className="inline-flex items-center gap-2 text-xs font-medium text-amber-800" title="Margin on our price (not markup): rate = cost / (1 - margin). Lines can have their own.">
                Margin %
                <input
                  inputMode="decimal"
                  value={d.marginPct ?? ""}
                  placeholder="0"
                  onChange={(e) => update({ marginPct: e.target.value, rows: d.rows.map((r) => reprice(r, clampMargin(num(e.target.value)), inclusive)) })}
                  className={`w-16 rounded-md border bg-white px-2 py-1 text-right text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${has(d.marginPct) ? "border-amber-300" : "border-rose-400"}`}
                />
              </label>
            )}
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
                    {r.modules?.length ? " · modular outdoor" : r.custom && " · custom"}
                  </span>
                  {tools}
                </div>
                {!r.custom && (
                  <SearchableSelect
                    options={productOptions}
                    value={r.productId ?? ""}
                    placeholder="Search model or code…"
                    action={modularAction(r.uid)}
                    onSelect={(o) => {
                      const m = o ? optionById.get(o.id) : undefined;
                      setRow(
                        r.uid,
                        m
                          ? { productId: m.id, description: m.model, detail: m.availability, unitPrice: m.rate != null ? String(quoteRate(m.rate)) : r.unitPrice, ...(noDiscount(m) ? { discountPct: "" } : {}) }
                          : { productId: null },
                      );
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
                    <input inputMode="decimal" enterKeyHint={withInstallation ? "next" : "done"} value={r.unitPrice} readOnly={has(r.costRate) || !!r.modules?.length} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setRow(r.uid, { unitPrice: e.target.value })} className={`${big} read-only:bg-amber-50`} />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Discount % (not printed){isHead && opt?.maxDiscountPct != null ? ` (max ${opt.maxDiscountPct}%)` : ""}
                  </span>
                  <input
                    inputMode="decimal"
                    value={noDiscount(opt) ? "" : (r.discountPct ?? "")}
                    placeholder="0"
                    disabled={noDiscount(opt)}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setRow(r.uid, { discountPct: e.target.value })}
                    className={`${big} disabled:bg-slate-100`}
                  />
                  {noDiscount(opt) && <span className="mt-1 block text-xs text-amber-700">Not in stock - tentative rate, no discount.</span>}
                  {discOf(r) > 0 && <span className="mt-1 block text-xs text-slate-500">Net rate {naira(inclusive ? round2(netRate(r) / vatFactor) : netRate(r))} excl. VAT</span>}
                </label>
                {withInstallation && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Installation rate {inclusive ? "incl." : "excl."} VAT (₦)</span>
                    <input inputMode="decimal" enterKeyHint="done" value={r.installRate ?? ""} readOnly={has(r.costInstall)} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setRow(r.uid, { installRate: e.target.value })} className={`${big} read-only:bg-amber-50`} />
                  </label>
                )}
                {d.costing && costBlock(r)}
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
                <th className="px-3 py-2 w-28 text-right" title="Not printed - the document shows the rate after the discount">Disc. % (not printed)</th>
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
                          action={modularAction(r.uid)}
                          onSelect={(o) => {
                            const m = o ? optionById.get(o.id) : undefined;
                            setRow(r.uid, m
                              ? { productId: m.id, description: m.model, detail: m.availability, unitPrice: m.rate != null ? String(quoteRate(m.rate)) : r.unitPrice, ...(noDiscount(m) ? { discountPct: "" } : {}) }
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
                      {r.modules?.length ? (
                        modularNote(r)
                      ) : (
                        r.custom && <p className="text-[11px] text-slate-400">Custom item - not from the product list</p>
                      )}
                      {d.costing && costBlock(r)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input list="quote-units" value={r.unit} onChange={(e) => setRow(r.uid, { unit: e.target.value })} className={input} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input inputMode="decimal" value={r.qty} onChange={(e) => setRow(r.uid, { qty: e.target.value })} className={`${input} text-right`} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        inputMode="decimal"
                        value={r.unitPrice}
                        readOnly={has(r.costRate) || !!r.modules?.length}
                        title={r.modules?.length ? "The sum of the modules' rates - Edit modules to change" : has(r.costRate) ? "From our cost + margin - change the cost or margin" : undefined}
                        onChange={(e) => setRow(r.uid, { unitPrice: e.target.value })}
                        className={`${input} text-right read-only:bg-amber-50`}
                      />
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
                        value={noDiscount(opt) ? "" : (r.discountPct ?? "")}
                        placeholder="0"
                        disabled={noDiscount(opt)}
                        title={noDiscount(opt) ? "Not in stock - quoted at the tentative rate, no discount" : undefined}
                        onChange={(e) => setRow(r.uid, { discountPct: e.target.value })}
                        className={`${input} text-right disabled:bg-slate-100`}
                      />
                      {noDiscount(opt) && <p className="mt-1 text-right text-[11px] text-amber-700">No discount - not in stock</p>}
                      {discOf(r) > 0 && (
                        <p className="mt-1 text-right text-[11px] text-slate-500">
                          Net {naira(inclusive ? round2(netRate(r) / vatFactor) : netRate(r))} excl. VAT
                        </p>
                      )}
                      {isHead && opt?.maxDiscountPct != null && <p className="mt-0.5 text-right text-[11px] text-slate-400">Max {opt.maxDiscountPct}%</p>}
                    </td>
                    {withInstallation && (
                      <td className="px-3 py-2 align-top">
                        <input
                          inputMode="decimal"
                          value={r.installRate ?? ""}
                          readOnly={has(r.costInstall)}
                          title={has(r.costInstall) ? "From our cost + margin - change the cost or margin" : undefined}
                          onChange={(e) => setRow(r.uid, { installRate: e.target.value })}
                          className={`${input} text-right read-only:bg-amber-50`}
                        />
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
          <label
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 ${importing ? "opacity-60" : ""}`}
            title="A contractor's installation bill: its supply and installation rates come in as our costs and are priced with your margin %"
          >
            <FileUp className="h-4 w-4" />
            {importing ? "Importing…" : "Import contractor's bill (add margin)"}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) importExcel(f, true);
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
            {d.costing && costTotal > 0 && (
              <div className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-slate-700">
                <p className="font-semibold text-amber-800">Margin on the costed lines (not printed)</p>
                <div className="flex justify-between">
                  <span>Our cost</span>
                  <span className="tabular-nums">{naira(costTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Our price (excl. VAT)</span>
                  <span className="tabular-nums">{naira(pricedTotal)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Margin</span>
                  <span className="tabular-nums">
                    {naira(round2(pricedTotal - costTotal))} ({(marginPctOf(costTotal, pricedTotal) ?? 0).toFixed(1)}%)
                  </span>
                </div>
              </div>
            )}
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

      {unlinkedRef && !linkedDealId && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
          <p className="text-sm font-medium text-indigo-900">
            Quotation {unlinkedRef} is saved, but not linked to a deal. Create a deal for it now, so it&apos;s followed up in the pipeline.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block w-full sm:w-96">
              <span className="mb-1 block text-xs font-medium text-indigo-800">Deal name</span>
              <input value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} placeholder="Customer - project" className={input} />
            </label>
            {dealOwners && (
              <label className="block w-full sm:w-64">
                <span className="mb-1 block text-xs font-medium text-indigo-800">Sales person</span>
                <select value={dealOwner} onChange={(e) => setDealOwner(e.target.value)} className={input}>
                  {isHead ? <option value={myId}>Me (Head of Sales)</option> : <option value="">Pick the sales person…</option>}
                  {dealOwners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              disabled={linking}
              onClick={async () => {
                setLinking(true);
                setLinkError(null);
                if (dealOwners && !isHead && !dealOwner) {
                  setLinking(false);
                  return setLinkError("Pick the sales person this deal is for.");
                }
                const res = await createDealForQuote(unlinkedRef, dealTitle, dealOwner || undefined);
                setLinking(false);
                if (res.error) setLinkError(res.error);
                else if (res.dealId) setCreatedDealId(res.dealId);
              }}
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {linking ? "Creating…" : "Create deal & link quotation"}
            </button>
            <Link href={`/quotations/saved?q=${encodeURIComponent(unlinkedRef)}`} className="pb-2 text-sm font-medium text-indigo-700 hover:text-indigo-900">
              Link to an existing deal instead
            </Link>
            <button type="button" onClick={() => setUnlinkedRef(null)} className="pb-2 text-sm text-slate-500 hover:text-slate-700">
              Later
            </button>
          </div>
          <p className="text-xs text-indigo-800/80">
            The deal goes in at the Quotation stage{dealOwners ? " under the sales person picked (the quotation moves to them too)" : ""}, with the quote&apos;s products and
            quantities.
          </p>
          {linkError && <p className="text-sm text-red-600">{linkError}</p>}
        </div>
      )}
      {createdDealId && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Deal created and the quotation linked to it.{" "}
          <Link href={`/deals/${createdDealId}`} className="font-medium underline">
            Open the deal
          </Link>
        </div>
      )}

      {/* Downloads */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="text-sm">
          <span className="text-slate-500">{TYPE_LABELS[d.type]} total incl. VAT: </span>
          <span className="font-bold text-slate-900 tabular-nums">{naira(total)}</span>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {draftNote && !error && <p className="text-sm text-emerald-700">{draftNote}</p>}
        {held && <p className="basis-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 order-last">{held}</p>}
        <div className="ml-auto flex flex-wrap gap-2">
          {/* Not downloaded yet: save it as a draft, or throw it away. Once
              downloaded it's saved as the quotation. */}
          {!isIssuedQuoteRef(d.ref) && (
            <>
              <button
                type="button"
                onClick={discard}
                disabled={busy != null || savingDraft}
                className="rounded-lg px-3 py-2 text-sm text-rose-600 hover:text-rose-700 disabled:opacity-60"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={saveDraft}
                disabled={busy != null || savingDraft}
                className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {savingDraft ? "Saving…" : draftId ? "Save draft" : "Save as draft"}
              </button>
            </>
          )}
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
          {canExcel && (
          <button
            type="button"
            disabled={busy != null}
            onClick={() => download("xlsx")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {busy === "xlsx" ? "Preparing Excel…" : "Download Excel"}
          </button>
          )}
          {canExcel && d.costing && costItems.length > 0 && (
            <button
              type="button"
              disabled={busy != null}
              onClick={downloadCosting}
              title="Internal: our costs, margins and rates line by line - not for the client"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {busy === "costing" ? "Preparing…" : "Costing sheet (Excel)"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
