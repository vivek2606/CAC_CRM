"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";
import { COMPLAINT_NATURES, STANDARD_WARRANTY_MONTHS } from "@/lib/service";
import { findSaleByInvoice, registerComplaint, type ComplaintInput, type SaleMatch } from "../actions";

const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
const dmy = (iso: string) => iso.split("-").reverse().join("/");

// In warranty: registered within the warranty months after the invoice date.
function warrantyCheck(invoiceDate: string, months: number, registeredAt: string): { inWarranty: boolean; until: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return null;
  const [y, m, d] = invoiceDate.split("-").map(Number);
  const until = new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
  return { inWarranty: registeredAt.slice(0, 10) <= until, until };
}

export function RegisterComplaintForm({ now, products, technicians }: { now: string; products: SearchableOption[]; technicians: string[] }) {
  const router = useRouter();
  const [v, setV] = useState<ComplaintInput>({
    registeredAt: now,
    customerName: "",
    contactName: "",
    phone: "",
    siteAddress: "",
    accountId: "",
    dealId: "",
    invoiceNo: "",
    invoiceDate: "",
    billingCompany: "",
    productId: "",
    model: "",
    serialNo: "",
    warrantyMonths: STANDARD_WARRANTY_MONTHS,
    warrantyOverride: "",
    warrantyNote: "",
    nature: "",
    description: "",
    priority: "NORMAL",
    technician: "",
  });
  const set = (patch: Partial<ComplaintInput>) => setV((x) => ({ ...x, ...patch }));
  const [lookup, setLookup] = useState("");
  const [matches, setMatches] = useState<SaleMatch[] | null>(null);
  const [sale, setSale] = useState<SaleMatch | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const w = warrantyCheck(v.invoiceDate, v.warrantyMonths, v.registeredAt);

  const find = () =>
    start(async () => {
      setError("");
      const res = await findSaleByInvoice(lookup);
      setMatches(res);
      if (res.length === 1) pick(res[0]);
    });
  const pick = (s: SaleMatch) => {
    setSale(s);
    set({
      dealId: s.dealId,
      accountId: s.accountId ?? "",
      customerName: s.customer,
      phone: v.phone || s.phone,
      invoiceNo: s.invoiceNo,
      invoiceDate: s.invoiceDate,
      billingCompany: s.company,
      warrantyMonths: s.warrantyMonths,
      productId: s.products.length === 1 ? s.products[0].productId : "",
      model: s.products.length === 1 ? s.products[0].model : "",
    });
  };
  const save = () =>
    start(async () => {
      setError("");
      const res = await registerComplaint(v);
      if (res.error) return setError(res.error);
      router.push(`/service/${res.id}`);
    });

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">1. The sale</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Invoice no.</span>
            <input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), find())}
              className={`${field} w-56`}
              placeholder="e.g. 10423 or INV-55"
            />
          </label>
          <button type="button" onClick={find} disabled={pending || !lookup.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
            <Search className="h-4 w-4" /> Find sale
          </button>
          <span className="text-xs text-slate-500">Not sold by us / no invoice? Fill in the customer and unit below.</span>
        </div>
        {matches && matches.length === 0 && <p className="mt-2 text-sm text-amber-700">No won sale with that invoice no. - check it, or enter the details by hand.</p>}
        {matches && matches.length > 1 && (
          <div className="mt-2 space-y-1">
            {matches.map((m) => (
              <button
                key={m.dealId}
                type="button"
                onClick={() => pick(m)}
                className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${sale?.dealId === m.dealId ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}
              >
                <b>{m.customer}</b> · Inv {m.invoiceNo} {m.company && `(${m.company})`} · {dmy(m.invoiceDate)} · {m.products.map((p) => p.model).join(", ")}
              </button>
            ))}
          </div>
        )}
        {sale && (
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            ✓ {sale.customer} · invoice {sale.invoiceNo} {sale.company && `(${sale.company})`} dated {dmy(sale.invoiceDate)}
            {sale.warrantyMonths !== STANDARD_WARRANTY_MONTHS && ` · special warranty: ${sale.warrantyMonths} months`}
          </p>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <h3 className="text-sm font-semibold text-slate-900 sm:col-span-2 lg:col-span-3">2. Customer and unit</h3>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Customer *</span>
          <input value={v.customerName} onChange={(e) => set({ customerName: e.target.value })} className={field} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Contact person</span>
          <input value={v.contactName} onChange={(e) => set({ contactName: e.target.value })} className={field} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Phone</span>
          <input value={v.phone} onChange={(e) => set({ phone: e.target.value })} className={field} />
        </label>
        <label className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">
          <span className="mb-1 block">Site address</span>
          <input value={v.siteAddress} onChange={(e) => set({ siteAddress: e.target.value })} className={field} />
        </label>
        <div className="text-xs text-slate-500">
          <span className="mb-1 block">Model</span>
          {sale && sale.products.length > 1 ? (
            <select
              value={v.productId}
              onChange={(e) => set({ productId: e.target.value, model: sale.products.find((p) => p.productId === e.target.value)?.model ?? "" })}
              className={field}
            >
              <option value="">Pick the unit...</option>
              {sale.products.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {p.model} ({p.qty} on the invoice)
                </option>
              ))}
            </select>
          ) : (
            <SearchableSelect key={sale?.dealId ?? "manual"} options={products} defaultValue={v.productId} onSelect={(o) => set({ productId: o?.id ?? "", model: o?.label ?? "" })} placeholder="Search models..." />
          )}
        </div>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Serial no.</span>
          <input value={v.serialNo} onChange={(e) => set({ serialNo: e.target.value })} className={field} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Invoice date (if no sale found)</span>
          <input type="date" value={v.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} disabled={!!sale} className={`${field} disabled:bg-slate-50`} />
        </label>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <h3 className="text-sm font-semibold text-slate-900 sm:col-span-2 lg:col-span-3">3. The complaint</h3>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Registered on (date & time) *</span>
          <input type="datetime-local" value={v.registeredAt} onChange={(e) => set({ registeredAt: e.target.value })} className={field} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Nature of complaint *</span>
          <select value={v.nature} onChange={(e) => set({ nature: e.target.value })} className={field}>
            <option value="">Pick...</option>
            {COMPLAINT_NATURES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Priority</span>
          <select value={v.priority} onChange={(e) => set({ priority: e.target.value })} className={field}>
            <option value="NORMAL">Normal</option>
            <option value="URGENT">Urgent</option>
          </select>
        </label>
        <label className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">
          <span className="mb-1 block">What the customer reported</span>
          <textarea value={v.description} onChange={(e) => set({ description: e.target.value })} rows={3} className={field} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Assign technician (optional)</span>
          <input value={v.technician} onChange={(e) => set({ technician: e.target.value })} list="technicians" className={field} />
          <datalist id="technicians">
            {technicians.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <h3 className="mb-1 font-semibold text-slate-900">4. Warranty</h3>
        <p className="text-slate-700">
          {w ? (
            <>
              Warranty {v.warrantyMonths} months from the invoice date, until <b>{dmy(w.until)}</b> -{" "}
              <b className={w.inWarranty ? "text-emerald-700" : "text-amber-700"}>{w.inWarranty ? "IN WARRANTY" : "OUT OF WARRANTY"}</b>
              {w.inWarranty ? " (spares free of cost)" : " (spares and service charged - invoice the customer)"}.
            </>
          ) : (
            <>No invoice date - out of warranty unless overridden below.</>
          )}
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Warranty months</span>
            <input
              type="number"
              min={0}
              value={v.warrantyMonths}
              onChange={(e) => set({ warrantyMonths: Number(e.target.value) || 0 })}
              className={`${field} w-24`}
            />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Override</span>
            <select value={v.warrantyOverride} onChange={(e) => set({ warrantyOverride: e.target.value as ComplaintInput["warrantyOverride"] })} className={`${field} w-48`}>
              <option value="">As worked out</option>
              <option value="in">Treat as in warranty</option>
              <option value="out">Treat as out of warranty</option>
            </select>
          </label>
          {(v.warrantyOverride || v.warrantyMonths !== (sale?.warrantyMonths ?? STANDARD_WARRANTY_MONTHS)) && (
            <label className="min-w-[240px] flex-1 text-xs text-slate-500">
              <span className="mb-1 block">Why (exceptional warranty terms)</span>
              <input value={v.warrantyNote} onChange={(e) => set({ warrantyNote: e.target.value })} className={field} placeholder="e.g. 2-year warranty agreed in the PO" />
            </label>
          )}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
          {pending ? "Saving..." : "Register complaint"}
        </button>
      </div>
    </div>
  );
}
