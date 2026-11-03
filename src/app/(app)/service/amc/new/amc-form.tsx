"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";
import { createAmc, type AmcInput } from "../../base-actions";

export type AmcUnitOption = { id: string; label: string; inAmc: boolean; preselect: boolean };
const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";

export function AmcForm({
  accounts,
  units,
  initial,
}: {
  accounts: SearchableOption[];
  units: AmcUnitOption[];
  initial: { customerName: string; accountId: string; phone: string; siteAddress: string; billingCompany: string; startDate: string; endDate: string };
}) {
  const router = useRouter();
  const [v, setV] = useState<AmcInput>({
    ...initial,
    contactName: "",
    value: 0,
    visitsPerYear: 4,
    comprehensive: false,
    invoiceNo: "",
    notes: "",
    unitIds: units.filter((u) => u.preselect).map((u) => u.id),
  });
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (p: Partial<AmcInput>) => setV((x) => ({ ...x, ...p }));
  const toggle = (id: string) => set({ unitIds: v.unitIds.includes(id) ? v.unitIds.filter((x) => x !== id) : [...v.unitIds, id] });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="text-xs text-slate-500">
          <span className="mb-1 block">Account</span>
          <SearchableSelect
            options={accounts}
            defaultValue={v.accountId}
            onSelect={(o) => set({ accountId: o?.id ?? "", ...(o && !v.customerName ? { customerName: o.label.replace(/ \([^)]*\)$/, "") } : {}) })}
            placeholder="Search accounts..."
          />
        </div>
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
        <label className="text-xs text-slate-500 sm:col-span-2">
          <span className="mb-1 block">Site address</span>
          <input value={v.siteAddress} onChange={(e) => set({ siteAddress: e.target.value })} className={field} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Start *</span>
          <input type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} className={field} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">End *</span>
          <input type="date" value={v.endDate} onChange={(e) => set({ endDate: e.target.value })} className={field} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Contract value (₦, excl. VAT)</span>
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className={`${field} text-right`} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Service visits a year</span>
          <select value={v.visitsPerYear} onChange={(e) => set({ visitsPerYear: Number(e.target.value) })} className={field}>
            {[1, 2, 3, 4, 6, 12].map((n) => (
              <option key={n} value={n}>
                {n} {n === 4 ? "(quarterly)" : n === 12 ? "(monthly)" : n === 2 ? "(half-yearly)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Cover</span>
          <select value={v.comprehensive ? "1" : "0"} onChange={(e) => set({ comprehensive: e.target.value === "1" })} className={field}>
            <option value="0">Labour / servicing only (spares charged)</option>
            <option value="1">Comprehensive (spares included)</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Billed by</span>
          <select value={v.billingCompany} onChange={(e) => set({ billingCompany: e.target.value })} className={field}>
            <option value="Sakuragi">Sakuragi</option>
            <option value="Somotex">Somotex</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Invoice no. (when billed)</span>
          <input value={v.invoiceNo} onChange={(e) => set({ invoiceNo: e.target.value })} className={field} />
        </label>
        <label className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">
          <span className="mb-1 block">Notes / scope</span>
          <input value={v.notes} onChange={(e) => set({ notes: e.target.value })} className={field} placeholder="e.g. quarterly cleaning, gas check, electrical check" />
        </label>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-slate-900">Units covered</h3>
        {units.length === 0 ? (
          <p className="text-sm text-slate-500">Open this from a unit (Installed units → Offer AMC) to pick the customer&apos;s units, or add them from the contract afterwards.</p>
        ) : (
          <ul className="space-y-1">
            {units.map((u) => (
              <li key={u.id}>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={v.unitIds.includes(u.id)} onChange={() => toggle(u.id)} className="h-4 w-4 rounded border-slate-300" />
                  {u.label}
                  {u.inAmc && <span className="text-xs text-amber-700">(already under an AMC - moves to this one)</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError("");
              const res = await createAmc({ ...v, value: Number(value.replace(/,/g, "")) || 0 });
              if (res.error) return setError(res.error);
              router.push(`/service/amc/${res.id}`);
            })
          }
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending ? "Saving..." : "Create AMC contract"}
        </button>
      </div>
    </div>
  );
}
