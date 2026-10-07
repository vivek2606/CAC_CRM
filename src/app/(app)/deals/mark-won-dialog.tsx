"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { parseWonItemsSheet } from "./actions";

export type WonProductOption = { id: string; label: string; defaultPrice: number | null };
export type WonExistingItem = { productId: string; label: string; qty: number; unitPrice: number };
export type WonInvoiceInput = { invoiceNo: string; closedAt: string; items: { productId: string; qty: number; unitPrice: number }[] };

type Row = { key: string; productId: string; qty: string; rate: string };
type Block = { key: string; invoiceNo: string; closedAt: string; rows: Row[] };

const naira = (n: number) => `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: string) => {
  const n = Number(v.replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const newKey = () => Math.random().toString(36).slice(2);
const blankRow = (): Row => ({ key: newKey(), productId: "", qty: "1", rate: "" });

// Marking a deal Won records what was billed: one or more invoices, each
// with its invoice no., date (when the sale counts toward targets and
// incentives) and products (model, qty, basic rate excl. VAT). The first
// invoice stays on this deal; each further one becomes its own Won deal.
export function MarkWonDialog({
  existingItems,
  quotedValue,
  products,
  onConfirm,
  onCancel,
  wonInvoice,
}: {
  existingItems: WonExistingItem[];
  quotedValue: number;
  products: WonProductOption[];
  onConfirm: (invoices: WonInvoiceInput[]) => void;
  onCancel: () => void;
  // Set for a deal that is already Won: its current invoice no. and date,
  // so its invoices and products can be recorded (or split) after the fact.
  wonInvoice?: { invoiceNo: string; closedAt: string };
}) {
  const today = new Date().toISOString().slice(0, 10);
  const priceById = new Map(products.map((p) => [p.id, p.defaultPrice]));
  const [blocks, setBlocks] = useState<Block[]>(() => [
    {
      key: newKey(),
      invoiceNo: wonInvoice?.invoiceNo ?? "",
      closedAt: wonInvoice?.closedAt || today,
      rows: existingItems.length
        ? existingItems.map((i) => ({ key: newKey(), productId: i.productId, qty: String(i.qty), rate: String(i.unitPrice) }))
        : [blankRow()],
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<{ block: string; text: string } | null>(null);
  const [uploading, startUpload] = useTransition();

  const setBlock = (key: string, patch: Partial<Block>) => {
    setError(null);
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  };
  const setRow = (bkey: string, rkey: string, patch: Partial<Row>) => {
    setError(null);
    setBlocks((bs) => bs.map((b) => (b.key === bkey ? { ...b, rows: b.rows.map((r) => (r.key === rkey ? { ...r, ...patch } : r)) } : b)));
  };
  const blockTotal = (b: Block) => b.rows.reduce((s, r) => s + num(r.qty) * num(r.rate), 0);
  const grand = blocks.reduce((s, b) => s + blockTotal(b), 0);

  const upload = (bkey: string, file: File) =>
    startUpload(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const res = await parseWonItemsSheet(fd);
      if (res.rows.length) {
        setError(null);
        setBlocks((bs) =>
          bs.map((b) =>
            b.key === bkey
              ? { ...b, rows: [...b.rows.filter((r) => r.productId), ...res.rows.map((x) => ({ key: newKey(), productId: x.productId, qty: String(x.qty), rate: String(x.unitPrice) }))] }
              : b,
          ),
        );
      }
      setUploadNote({
        block: bkey,
        text: `${res.rows.length} product${res.rows.length === 1 ? "" : "s"} added from the sheet.` + (res.problems.length ? ` Not added: ${res.problems.join("; ")}` : ""),
      });
    });

  const confirm = () => {
    const invoices: WonInvoiceInput[] = [];
    for (const [n, b] of blocks.entries()) {
      const label = blocks.length > 1 ? ` on invoice ${n + 1}` : "";
      const filled = b.rows.filter((r) => r.productId || r.rate.trim());
      if (filled.length === 0) return setError(`Add the products billed${label} - model, quantity and basic rate.`);
      if (filled.some((r) => !r.productId)) return setError(`Pick the product on every row${label} (or remove the empty row).`);
      if (filled.some((r) => num(r.qty) === 0 || num(r.rate) === 0)) return setError(`Every product${label} needs a quantity and a basic rate (use a minus sign for a sales return).`);
      if (!b.invoiceNo.trim()) return setError(`Enter the invoice no.${label}.`);
      if (!b.closedAt) return setError(`Enter the invoice date${label}.`);
      invoices.push({ invoiceNo: b.invoiceNo.trim(), closedAt: b.closedAt, items: filled.map((r) => ({ productId: r.productId, qty: num(r.qty), unitPrice: num(r.rate) })) });
    }
    const nos = invoices.map((i) => i.invoiceNo.toLowerCase());
    if (new Set(nos).size !== nos.length) return setError("Each invoice needs a different invoice no.");
    onConfirm(invoices);
  };

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-slate-900 mb-1">{wonInvoice ? "Invoices & products billed" : "Mark this deal Won"}</h2>
        <p className="text-xs text-slate-500 mb-4">
          Record the invoice and what was billed on it. If the order was billed on more than one invoice, add each invoice - the first stays on this deal and
          each other one becomes its own won deal with the same customer and details. The invoice date is when the sale counts toward targets and incentives.
        </p>

        <div className="space-y-4">
          {blocks.map((b, n) => (
            <div key={b.key} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-end gap-3 mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 w-full sm:w-auto sm:pb-2">
                  {blocks.length > 1 ? `Invoice ${n + 1}${n === 0 ? " (this deal)" : " (new deal)"}` : "Invoice"}
                </p>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Invoice no. *</label>
                  <input value={b.invoiceNo} onChange={(e) => setBlock(b.key, { invoiceNo: e.target.value })} placeholder="e.g. 2026091005" className={input} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Invoice date *</label>
                  <input type="date" value={b.closedAt} max={today} onChange={(e) => setBlock(b.key, { closedAt: e.target.value })} className={input} />
                </div>
                {blocks.length > 1 && (
                  <button
                    type="button"
                    title="Remove this invoice"
                    onClick={() => setBlocks((bs) => bs.filter((x) => x.key !== b.key))}
                    className="mb-2 text-slate-400 hover:text-rose-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-[1fr_72px_140px_24px] gap-2 text-[11px] font-medium text-slate-500">
                  <span>Products billed - model *</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Basic rate excl. VAT ₦</span>
                  <span />
                </div>
                {b.rows.map((r) => (
                  <div key={r.key} className="grid grid-cols-1 sm:grid-cols-[1fr_72px_140px_24px] gap-2 items-start">
                    <SearchableSelect
                      options={products}
                      value={r.productId}
                      placeholder="Search model or code…"
                      onSelect={(o) => {
                        const price = o ? priceById.get(o.id) : null;
                        setRow(b.key, r.key, { productId: o?.id ?? "", rate: price != null && !r.rate ? String(price) : r.rate });
                      }}
                    />
                    <input inputMode="decimal" value={r.qty} onChange={(e) => setRow(b.key, r.key, { qty: e.target.value })} aria-label="Quantity" className={`${input} text-right`} />
                    <input inputMode="decimal" value={r.rate} onChange={(e) => setRow(b.key, r.key, { rate: e.target.value })} aria-label="Basic rate" placeholder="0.00" className={`${input} text-right`} />
                    <button
                      type="button"
                      title="Remove"
                      onClick={() => setBlock(b.key, { rows: b.rows.length > 1 ? b.rows.filter((x) => x.key !== r.key) : [blankRow()] })}
                      className="mt-2 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setBlock(b.key, { rows: [...b.rows, blankRow()] })} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                  <Plus className="h-4 w-4" />
                  Add product
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                  <Upload className="h-4 w-4" />
                  {uploading ? "Reading…" : "Upload from Excel"}
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) upload(b.key, f);
                    }}
                  />
                </label>
                <a href="/deals/won-items-template" download className="text-xs text-slate-500 hover:text-slate-800">
                  Download template
                </a>
                <span className="ml-auto text-sm text-slate-700">
                  Invoice total (excl. VAT): <span className="font-semibold tabular-nums">{naira(blockTotal(b))}</span>
                </span>
              </div>
              {uploadNote?.block === b.key && <p className="mt-1 text-xs text-slate-600">{uploadNote.text}</p>}
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setBlocks((bs) => [...bs, { key: newKey(), invoiceNo: "", closedAt: bs[bs.length - 1]?.closedAt ?? today, rows: [blankRow()] }])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Add another invoice
          </button>
          <p className="ml-auto text-sm text-slate-700">
            {blocks.length > 1 ? "All invoices" : "Total"} (excl. VAT): <span className="font-semibold tabular-nums">{naira(grand)}</span>
            {quotedValue > 0 && Math.abs(grand - quotedValue) >= 0.01 && <span className="ml-2 text-xs text-slate-500">quoted {naira(quotedValue)}</span>}
          </p>
        </div>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2">
            Cancel
          </button>
          <button type="button" onClick={confirm} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-3.5 py-2">
            {wonInvoice
              ? blocks.length > 1
                ? `Save ${blocks.length} invoices`
                : "Save"
              : blocks.length > 1
                ? `Mark Won (${blocks.length} invoices)`
                : "Mark Won"}
          </button>
        </div>
      </div>
    </div>
  );
}
