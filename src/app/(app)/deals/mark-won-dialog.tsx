"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { parseWonItemsSheet } from "./actions";

export type WonProductOption = { id: string; label: string; defaultPrice: number | null };
export type WonExistingItem = { label: string; qty: number; unitPrice: number };
export type WonNewItem = { productId: string; qty: number; unitPrice: number };

type Row = { key: string; productId: string; label: string; qty: string; rate: string };

const naira = (n: number) => `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: string) => {
  const n = Number(v.replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const newKey = () => Math.random().toString(36).slice(2);
const blank = (): Row => ({ key: newKey(), productId: "", label: "", qty: "1", rate: "" });

// Marking a deal Won asks for the products billed (quantity and basic rate,
// excl. VAT) when the deal has none yet - picked here or uploaded from a
// sheet - plus the invoice no. and date (the date the sale counts toward
// targets and incentives).
export function MarkWonDialog({
  existingItems,
  products,
  onConfirm,
  onCancel,
}: {
  existingItems: WonExistingItem[];
  products: WonProductOption[];
  onConfirm: (closedAt: string, invoiceNo: string, newItems: WonNewItem[]) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [closedAt, setClosedAt] = useState(today);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [blank()]);
  const [error, setError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const needItems = existingItems.length === 0;
  const priceById = new Map(products.map((p) => [p.id, p.defaultPrice]));

  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const total = needItems
    ? rows.reduce((s, r) => s + num(r.qty) * num(r.rate), 0)
    : existingItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  const upload = (file: File) =>
    startUpload(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const res = await parseWonItemsSheet(fd);
      if (res.rows.length) setError(null);
      if (res.rows.length) {
        setRows((rs) => [
          ...rs.filter((r) => r.productId),
          ...res.rows.map((x) => ({ key: newKey(), productId: x.productId, label: x.label, qty: String(x.qty), rate: String(x.unitPrice) })),
        ]);
      }
      setUploadNote(
        `${res.rows.length} product${res.rows.length === 1 ? "" : "s"} added from the sheet.` + (res.problems.length ? ` Not added: ${res.problems.join("; ")}` : ""),
      );
    });

  const confirm = () => {
    let items: WonNewItem[] = [];
    if (needItems) {
      const filled = rows.filter((r) => r.productId || r.rate.trim());
      if (filled.length === 0) return setError("Add the products billed - model, quantity and basic rate.");
      if (filled.some((r) => !r.productId)) return setError("Pick the product on every row (or remove the empty row).");
      if (filled.some((r) => !(num(r.qty) > 0) || !(num(r.rate) > 0))) return setError("Every product needs a quantity and a basic rate above 0.");
      items = filled.map((r) => ({ productId: r.productId, qty: num(r.qty), unitPrice: num(r.rate) }));
    }
    if (!invoiceNo.trim()) return setError("Enter the invoice no.");
    if (!closedAt) return setError("Enter the invoice date.");
    onConfirm(closedAt, invoiceNo.trim(), items);
  };

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div
        className={`w-full ${needItems ? "max-w-3xl" : "max-w-md"} max-h-[90vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Mark this deal Won</h2>
        <p className="text-xs text-slate-500 mb-4">
          Record what was billed and the invoice. The invoice date is the date the sale counts toward targets and incentives.
        </p>

        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Products billed *</p>
          {!needItems ? (
            <div className="rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {existingItems.map((i, n) => (
                    <tr key={n}>
                      <td className="px-3 py-1.5 text-slate-700">{i.label}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{i.qty}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{naira(i.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
                From the deal&apos;s Products section - change them there before marking Won if they differ from the invoice.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-[1fr_80px_150px_28px] gap-2 text-[11px] font-medium text-slate-500">
                  <span>Model</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Basic rate (excl. VAT) ₦</span>
                  <span />
                </div>
                {rows.map((r) => (
                  <div key={r.key} className="grid grid-cols-1 sm:grid-cols-[1fr_80px_150px_28px] gap-2 items-start">
                    <SearchableSelect
                      options={products}
                      value={r.productId}
                      placeholder="Search model or code…"
                      onSelect={(o) => {
                        const price = o ? priceById.get(o.id) : null;
                        setRow(r.key, { productId: o?.id ?? "", label: o?.label ?? "", rate: price != null && !r.rate ? String(price) : r.rate });
                        setError(null);
                      }}
                    />
                    <input inputMode="decimal" value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value })} aria-label="Quantity" className={`${input} text-right`} />
                    <input inputMode="decimal" value={r.rate} onChange={(e) => setRow(r.key, { rate: e.target.value })} aria-label="Basic rate" placeholder="0.00" className={`${input} text-right`} />
                    <button
                      type="button"
                      title="Remove"
                      onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blank()]))}
                      className="mt-2 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setRows((rs) => [...rs, blank()])} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700">
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
                      if (f) upload(f);
                    }}
                  />
                </label>
                <a href="/deals/won-items-template" download className="text-xs text-slate-500 hover:text-slate-800">
                  Download template
                </a>
              </div>
              {uploadNote && <p className="mt-1 text-xs text-slate-600">{uploadNote}</p>}
            </>
          )}
          <p className="mt-2 text-right text-sm text-slate-700">
            Total (excl. VAT): <span className="font-semibold tabular-nums">{naira(total)}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Invoice no. *</label>
            <input
              value={invoiceNo}
              onChange={(e) => {
                setInvoiceNo(e.target.value);
                setError(null);
              }}
              placeholder="e.g. 2026091005"
              className={input}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Invoice date *</label>
            <input
              type="date"
              value={closedAt}
              max={today}
              onChange={(e) => {
                setClosedAt(e.target.value);
                setError(null);
              }}
              className={input}
            />
          </div>
        </div>
        {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2">
            Cancel
          </button>
          <button type="button" onClick={confirm} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-3.5 py-2">
            Mark Won
          </button>
        </div>
      </div>
    </div>
  );
}
