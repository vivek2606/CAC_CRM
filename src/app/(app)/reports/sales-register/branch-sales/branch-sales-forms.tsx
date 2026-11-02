"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";
import { addBranchSale } from "./actions";

const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
const naira = (n: number) => `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

function useAction() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, ok?: string, after?: () => void) =>
    start(async () => {
      setError("");
      setNote("");
      const res = await fn();
      if (res.error) return setError(res.error);
      after?.();
      if (ok) setNote(ok);
      router.refresh();
    });
  return { error, note, pending, run };
}

type Line = { key: number; productId: string; qty: string; rate: string };
let n = 0;
const newLine = (): Line => ({ key: ++n, productId: "", qty: "1", rate: "" });

// One sale: who, invoice, customer, the products billed.
export function BranchSaleForm({
  people,
  accounts,
  products,
  companies,
}: {
  // Branch sales people so far (names to pick from; a new name is fine).
  people: string[];
  accounts: SearchableOption[];
  products: SearchableOption[];
  companies: readonly string[];
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(today());
  const [invoiceNo, setInvoiceNo] = useState("");
  const [company, setCompany] = useState<string>(companies[0]);
  const [accountId, setAccountId] = useState("");
  const [customer, setCustomer] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [formKey, setFormKey] = useState(0);
  const { error, note, pending, run } = useAction();
  const num = (s: string) => Number(s.replace(/,/g, "")) || 0;
  const total = lines.reduce((t, l) => t + num(l.qty) * num(l.rate), 0);
  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = () =>
    run(
      () =>
        addBranchSale({
          name,
          date,
          invoiceNo,
          company,
          accountId,
          customer,
          lines: lines.map((l) => ({ productId: l.productId, qty: num(l.qty), rate: num(l.rate) })),
        }),
      `Saved - invoice ${invoiceNo.trim()}, ${naira(total)}, under Others in the Sales Register.`,
      () => {
        setInvoiceNo("");
        setAccountId("");
        setCustomer("");
        setLines([newLine()]);
        setFormKey((k) => k + 1);
      },
    );

  return (
    <div key={formKey} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Branch sales person&apos;s name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} list="branch-names" className={`${field} w-full`} />
          <datalist id="branch-names">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Invoice date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} w-full`} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Invoice no.</span>
          <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className={`${field} w-full`} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Billing company</span>
          <select value={company} onChange={(e) => setCompany(e.target.value)} className={`${field} w-full`}>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="text-xs text-slate-500">
          <span className="mb-1 block">Customer account</span>
          <SearchableSelect options={accounts} onSelect={(o) => setAccountId(o?.id ?? "")} placeholder="Search accounts..." />
        </div>
        {!accountId && (
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">...or the customer&apos;s name (no account)</span>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} className={`${field} w-full`} />
          </label>
        )}
      </div>

      <div className="space-y-2">
        <div className="hidden grid-cols-[1fr_90px_150px_130px_32px] gap-2 text-xs font-medium text-slate-500 sm:grid">
          <span>Product</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Rate excl. VAT (₦)</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        {lines.map((l) => (
          <div key={l.key} className="grid grid-cols-[1fr_90px_150px_130px_32px] items-center gap-2">
            <SearchableSelect options={products} onSelect={(o) => set(l.key, { productId: o?.id ?? "" })} placeholder="Search products..." />
            <input inputMode="decimal" value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} className={`${field} text-right`} />
            <input inputMode="decimal" value={l.rate} onChange={(e) => set(l.key, { rate: e.target.value })} className={`${field} text-right`} />
            <span className="text-right text-sm tabular-nums text-slate-700">{naira(num(l.qty) * num(l.rate))}</span>
            <button
              type="button"
              onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
              className="text-slate-400 hover:text-rose-600"
              aria-label="Remove line"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setLines((ls) => [...ls, newLine()])} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500">
          <Plus className="h-4 w-4" /> Add product
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-3">
        <span className="text-sm text-slate-600">
          Total excl. VAT: <b className="tabular-nums text-slate-900">{naira(total)}</b>
        </span>
        <button type="button" disabled={pending} onClick={save} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
          {pending ? "Saving..." : "Save sale"}
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {note && <p className="text-sm text-emerald-700">✓ {note}</p>}
    </div>
  );
}
