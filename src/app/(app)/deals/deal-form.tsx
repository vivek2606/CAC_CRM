"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  OPEN_DEAL_STAGES,
  DEAL_STAGE_LABELS,
  EQUIPMENT_TYPES,
  EQUIPMENT_TYPE_LABELS,
  END_USE_SEGMENTS,
  END_USE_SEGMENT_LABELS,
} from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import type { DealStage, EquipmentType, EndUseSegment } from "@prisma/client";

type Option = { id: string; label: string };
type ProductOption = { id: string; label: string; defaultPrice: number | null };
type LineItemRow = { productId: string; qty: string; unitPrice: string };

export function DealForm({
  action,
  isHead,
  owners,
  accounts,
  contacts,
  products,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  isHead: boolean;
  owners: Option[];
  accounts: Option[];
  contacts: (Option & { accountId: string | null })[];
  // Only passed for the New Deal form - lets a rep itemize what's being
  // quoted (model, qty, rate) right at creation instead of a separate step
  // on the deal's own page afterward.
  products?: ProductOption[];
  defaultValues?: {
    title?: string;
    stage?: DealStage;
    value?: number;
    probability?: number;
    expectedCloseDate?: string | null;
    accountId?: string | null;
    contactId?: string | null;
    ownerId?: string;
    equipmentType?: EquipmentType | null;
    endUseSegment?: EndUseSegment | null;
    competitorBrand?: string | null;
  };
  submitLabel: string;
}) {
  const [accountId, setAccountId] = useState(defaultValues?.accountId ?? "");
  const visibleContacts = contacts.filter((c) => !accountId || c.accountId === accountId);

  const [items, setItems] = useState<LineItemRow[]>([]);
  const [value, setValue] = useState(defaultValues?.value != null ? String(defaultValues.value) : "");

  function itemsTotal(rows: LineItemRow[]): number {
    return rows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.unitPrice) || 0), 0);
  }

  function applyItems(rows: LineItemRow[]) {
    setItems(rows);
    const hasProduct = rows.some((r) => r.productId);
    if (hasProduct) setValue(String(itemsTotal(rows)));
  }

  function addRow() {
    applyItems([...items, { productId: "", qty: "1", unitPrice: "" }]);
  }

  function removeRow(index: number) {
    applyItems(items.filter((_, i) => i !== index));
  }

  function updateRow(index: number, patch: Partial<LineItemRow>) {
    const rows = items.map((r, i) => (i === index ? { ...r, ...patch } : r));
    applyItems(rows);
  }

  function handleProductChange(index: number, productId: string) {
    const product = products?.find((p) => p.id === productId);
    updateRow(index, {
      productId,
      unitPrice: product?.defaultPrice != null ? String(product.defaultPrice) : items[index].unitPrice,
    });
  }

  const validItems = items.filter((r) => r.productId && Number(r.qty) > 0);

  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <input type="hidden" name="lineItems" value={JSON.stringify(validItems)} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Deal title *</label>
          <input
            name="title"
            required
            defaultValue={defaultValues?.title}
            placeholder="e.g. Acme Corp - New Business"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Deal value (₦) *</label>
          <input
            name="value"
            type="number"
            min={0}
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {validItems.length > 0 && (
            <p className="mt-1 text-xs text-slate-400">Auto-filled from products below - edit to override.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Stage</label>
          <select
            name="stage"
            defaultValue={defaultValues?.stage ?? "QUALIFICATION"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {OPEN_DEAL_STAGES.map((s) => (
              <option key={s} value={s}>
                {DEAL_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Expected close date</label>
          <input
            name="expectedCloseDate"
            type="date"
            defaultValue={defaultValues?.expectedCloseDate ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Probability (%)</label>
          <input
            name="probability"
            type="number"
            min={0}
            max={100}
            defaultValue={defaultValues?.probability}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Equipment type</label>
          <select
            name="equipmentType"
            defaultValue={defaultValues?.equipmentType ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Unspecified</option>
            {EQUIPMENT_TYPES.map((e) => (
              <option key={e} value={e}>
                {EQUIPMENT_TYPE_LABELS[e]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">End-use segment</label>
          <select
            name="endUseSegment"
            defaultValue={defaultValues?.endUseSegment ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Unspecified</option>
            {END_USE_SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {END_USE_SEGMENT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Competing brand</label>
          <input
            name="competitorBrand"
            placeholder="e.g. Daikin, LG, Gree"
            defaultValue={defaultValues?.competitorBrand ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {products && (
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Products (model, quantity, rate)</label>
            {items.length > 0 && (
              <div className="mb-2 space-y-2">
                {items.map((row, index) => (
                  <div key={index} className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[160px]">
                      <select
                        value={row.productId}
                        onChange={(e) => handleProductChange(index, e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Choose a model...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-20">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="Qty"
                        value={row.qty}
                        onChange={(e) => updateRow(index, { qty: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="w-32">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="Rate (₦)"
                        value={row.unitPrice}
                        onChange={(e) => updateRow(index, { unitPrice: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      aria-label="Remove product"
                      className="text-slate-400 hover:text-red-600 transition-colors px-2 py-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-1.5 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add product
            </button>
            {validItems.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Products total: <span className="font-medium text-slate-700">{formatCurrency(itemsTotal(validItems))}</span>
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Account</label>
          <select
            name="accountId"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">None</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Contact</label>
          <select
            name="contactId"
            defaultValue={defaultValues?.contactId ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">None</option>
            {visibleContacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {isHead && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Owner</label>
            <select
              name="ownerId"
              defaultValue={defaultValues?.ownerId}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {!isHead && <input type="hidden" name="ownerId" value={defaultValues?.ownerId ?? ""} />}
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
