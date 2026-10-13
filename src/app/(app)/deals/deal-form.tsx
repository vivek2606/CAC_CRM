"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import {
  OPEN_DEAL_STAGES,
  DEAL_STAGE_LABELS,
  EQUIPMENT_TYPES,
  EQUIPMENT_TYPE_LABELS,
  END_USE_SEGMENTS,
  END_USE_SEGMENT_LABELS,
  PAYMENT_TERMS,
  PAYMENT_TERMS_LABELS,
} from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { SearchableSelect } from "@/components/searchable-select";
import { TagInput } from "@/components/tag-input";
import { CompletenessBar } from "@/components/completeness-bar";
import { parseWonItemsSheet } from "./actions";
import { groupSheetInvoices, type SheetInvoice } from "@/lib/sheet-invoices";
import type { DealStage, EquipmentType, EndUseSegment, PaymentTerms } from "@prisma/client";

type Option = { id: string; label: string };
type ProductOption = {
  id: string;
  label: string;
  defaultPrice: number | null;
  availableQty: number | null;
  // e.g. "12 in transit, ETA 05 Dec 2026" - set when units are on the way.
  inTransitLabel?: string | null;
};
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
  productsTotal = null,
  initialItems = [],
  requireItems = false,
  canEditCompany = false,
  dealId,
}: {
  action: (formData: FormData) => void;
  isHead: boolean;
  owners: Option[];
  accounts: Option[];
  contacts: (Option & { accountId: string | null; phone: string | null })[];
  // Only passed for the New Deal form - lets a rep itemize what's being
  // quoted (model, qty, rate) right at creation instead of a separate step
  // on the deal's own page afterward.
  products?: ProductOption[];
  defaultValues?: {
    title?: string;
    customerName?: string | null;
    customerPhone?: string | null;
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
    paymentTerms?: PaymentTerms | null;
    expectedDeliveryDate?: string | null;
    invoiceNo?: string | null;
    createdAt?: string;
    billingCompany?: string | null;
    tags?: string[];
  };
  submitLabel: string;
  // Total of the deal's saved products (edit form) - when set, the value is
  // taken from them and can't be typed over.
  productsTotal?: number | null;
  // Edit form: the deal's current products, editable here.
  initialItems?: LineItemRow[];
  // A won deal must keep at least one product billed.
  requireItems?: boolean;
  // Head / Coordinator: the billing company of a won deal can be corrected.
  canEditCompany?: boolean;
  // Edit form: lets the products sheet download pre-filled with this deal's list.
  dealId?: string;
}) {
  const [accountId, setAccountId] = useState(defaultValues?.accountId ?? "");
  const [contactId, setContactId] = useState(defaultValues?.contactId ?? "");
  const [customerName, setCustomerName] = useState(defaultValues?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(defaultValues?.customerPhone ?? "");
  const visibleContacts = contacts.filter((c) => !accountId || c.accountId === accountId);
  const today = new Date().toISOString().slice(0, 10);

  const completenessFields = [
    { label: "Account", filled: !!accountId },
    { label: "Contact", filled: !!contactId },
    { label: "Equipment type", filled: !!defaultValues?.equipmentType },
    { label: "Segment", filled: !!defaultValues?.endUseSegment },
    { label: "Competing brand", filled: !!defaultValues?.competitorBrand },
    { label: "Payment terms", filled: !!defaultValues?.paymentTerms },
    { label: "Expected close date", filled: !!defaultValues?.expectedCloseDate },
    { label: "Expected delivery date", filled: !!defaultValues?.expectedDeliveryDate },
  ];

  // Picking a contact - directly, or automatically because it's the
  // account's contact - carries its name/phone into the customer fields so
  // the rep doesn't retype what's already on file. Both stay plain editable
  // inputs, so this is just a starting point, not a locked value.
  function applyContact(contact: (typeof contacts)[number] | null) {
    setContactId(contact?.id ?? "");
    if (contact) {
      setCustomerName(contact.label);
      if (contact.phone) setCustomerPhone(contact.phone);
    }
  }

  function handleContactSelect(opt: Option | null) {
    applyContact(opt ? (contacts.find((c) => c.id === opt.id) ?? null) : null);
  }

  // Picking an account that already has a contact on file auto-selects
  // that contact too (the first one, if it has several) - the rep can
  // still swap it via the Contact field right below.
  function handleAccountChange(opt: Option | null) {
    const newAccountId = opt?.id ?? "";
    setAccountId(newAccountId);
    if (newAccountId) {
      const match = contacts.find((c) => c.accountId === newAccountId);
      if (match) applyContact(match);
    }
  }

  const [items, setItems] = useState<LineItemRow[]>(initialItems);
  const [formError, setFormError] = useState<string | null>(null);
  const [value, setValue] = useState(defaultValues?.value != null ? String(defaultValues.value) : "");

  // Products brought in by an Excel upload that aren't in the dropdown list
  // (e.g. no dealer price on file) - added so their rows still show a label.
  const [uploadedOptions, setUploadedOptions] = useState<ProductOption[]>([]);
  const productOptions = products
    ? [...products, ...uploadedOptions.filter((o) => !products.some((p) => p.id === o.id))]
    : undefined;
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  // Invoices from an uploaded sheet with Date / Invoice No filled in: on
  // save the deal is marked Won with them (each further invoice becomes its
  // own won deal, as in Mark Won). Dropped if the products are edited by hand.
  const [sheetInvoices, setSheetInvoices] = useState<SheetInvoice[]>([]);

  function uploadSheet(file: File) {
    startUpload(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const res = await parseWonItemsSheet(fd);
      const invoices = groupSheetInvoices(res.rows);
      setSheetInvoices(invoices);
      if (res.rows.length) {
        setFormError(null);
        setUploadedOptions((prev) => [
          ...prev,
          ...res.rows.map((r) => ({ id: r.productId, label: r.label, defaultPrice: null, availableQty: null, inTransitLabel: null })),
        ]);
        applyItems(res.rows.map((r) => ({ productId: r.productId, qty: String(r.qty), unitPrice: String(r.unitPrice) })), true);
      }
      setUploadNote(
        (res.rows.length
          ? `Product list replaced with ${res.rows.length} product${res.rows.length === 1 ? "" : "s"} from the sheet - review and save.`
          : "Nothing was taken from the sheet - the product list is unchanged.") +
          (res.problems.length ? ` Not added: ${res.problems.join("; ")}` : ""),
      );
    });
  }

  function itemsTotal(rows: LineItemRow[]): number {
    return rows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.unitPrice) || 0), 0);
  }

  function applyItems(rows: LineItemRow[], fromSheet = false) {
    setItems(rows);
    if (!fromSheet && sheetInvoices.length) {
      setSheetInvoices([]);
      setUploadNote("Products changed by hand - the invoices from the sheet won't be applied. Mark the deal Won from its page, or upload the sheet again.");
    }
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
    const product = productOptions?.find((p) => p.id === productId);
    updateRow(index, {
      productId,
      unitPrice: product?.defaultPrice != null ? String(product.defaultPrice) : items[index].unitPrice,
    });
  }

  // Negative quantity / rate = a sales return.
  const validItems = items.filter((r) => r.productId && Number.isFinite(Number(r.qty)) && Number(r.qty) !== 0);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (sheetInvoices.length && defaultValues?.stage !== "WON" && !new FormData(e.currentTarget).get("accountId")) {
          e.preventDefault();
          setFormError("Pick the account - it's needed to mark the deal Won with the invoices from the sheet.");
          return;
        }
        const noCompany = sheetInvoices.filter((i) => !i.company).map((i) => i.invoiceNo);
        if (noCompany.length) {
          e.preventDefault();
          setFormError(`No company for invoice ${noCompany.join(", ")} - fill in Sakuragi or Somotex in the Company column and upload the sheet again.`);
          return;
        }
        const undated = sheetInvoices.filter((i) => !i.closedAt).map((i) => i.invoiceNo);
        if (undated.length) {
          e.preventDefault();
          setFormError(`No date for invoice ${undated.join(", ")} - fill in the Date column in the sheet and upload it again.`);
          return;
        }
        if (!requireItems) return;
        if (validItems.length === 0 || validItems.some((r) => !Number(r.unitPrice))) {
          e.preventDefault();
          setFormError("A won deal needs at least one product billed, each with a quantity and a basic rate (negative for a return).");
        }
      }}
      className="space-y-5 max-w-2xl"
    >
      <input type="hidden" name="lineItems" value={JSON.stringify(validItems)} />
      {sheetInvoices.length > 0 && (
        <input
          type="hidden"
          name="wonInvoices"
          value={JSON.stringify(
            sheetInvoices.map((inv) => ({
              invoiceNo: inv.invoiceNo,
              closedAt: inv.closedAt,
              billingCompany: inv.company,
              items: inv.rows.map((r) => ({ productId: r.productId, qty: r.qty, unitPrice: r.unitPrice })),
            })),
          )}
        />
      )}
      {products && <input type="hidden" name="lineItemsPresent" value="1" />}
      <CompletenessBar fields={completenessFields} />
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

        {defaultValues?.stage === "WON" && canEditCompany && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Billed by</label>
            <select
              name="billingCompany"
              defaultValue={defaultValues?.billingCompany ?? ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Not recorded</option>
              <option value="Sakuragi">Sakuragi</option>
              <option value="Somotex">Somotex</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Customer name{isHead ? "" : " *"}</label>
          <input
            name="customerName"
            required={!isHead}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="e.g. Adaeze Okafor"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Customer phone{isHead ? "" : " *"}</label>
          <input
            name="customerPhone"
            required={!isHead}
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Lead date</label>
          <input
            name="createdAt"
            type="date"
            max={today}
            defaultValue={defaultValues?.createdAt ?? today}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-slate-400">When the enquiry first came in - defaults to today, backdate it if you&apos;re entering the deal later. Counts from this date in the reports (sales cycle, monthly figures).</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Deal value (₦) *</label>
          <input
            name="value"
            type="number"
            min={validItems.length > 0 ? undefined : 0}
            step="0.01"
            required
            value={productsTotal != null && !products ? String(productsTotal) : value}
            onChange={(e) => setValue(e.target.value)}
            readOnly={(productsTotal != null && !products) || validItems.length > 0}
            className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              (productsTotal != null && !products) || validItems.length > 0 ? "bg-slate-50 text-slate-600" : ""
            }`}
          />
          {((productsTotal != null && !products) || validItems.length > 0) && (
            <p className="mt-1 text-xs text-slate-400">Set from the products (quantity × basic rate, excl. VAT).</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Stage</label>
          {defaultValues?.stage === "WON" || defaultValues?.stage === "LOST" ? (
            <>
              <input type="hidden" name="stage" value={defaultValues.stage} />
              <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {DEAL_STAGE_LABELS[defaultValues.stage]}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                This deal is closed - stage can&apos;t be changed here.
              </p>
            </>
          ) : (
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
          )}
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

        {defaultValues?.stage === "WON" && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Invoice no.</label>
            <input
              name="invoiceNo"
              defaultValue={defaultValues?.invoiceNo ?? ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Expected delivery date</label>
          <input
            name="expectedDeliveryDate"
            type="date"
            defaultValue={defaultValues?.expectedDeliveryDate ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Payment terms</label>
          <select
            name="paymentTerms"
            defaultValue={defaultValues?.paymentTerms ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Unspecified</option>
            {PAYMENT_TERMS.map((t) => (
              <option key={t} value={t}>
                {PAYMENT_TERMS_LABELS[t]}
              </option>
            ))}
          </select>
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
          <div id="products" className="sm:col-span-2 scroll-mt-24">
            <label className="block text-sm font-medium text-slate-700 mb-1">Products (model, quantity, rate)</label>
            {items.length > 0 && (
              <div className="mb-2 space-y-2">
                {items.map((row, index) => {
                  const selectedProduct = productOptions?.find((p) => p.id === row.productId);
                  return (
                  <div key={index} className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[160px]">
                      <SearchableSelect
                        options={productOptions ?? []}
                        value={row.productId}
                        onSelect={(opt) => handleProductChange(index, opt?.id ?? "")}
                        placeholder="Type to search models..."
                        emptyLabel="unset"
                      />
                      {selectedProduct && (selectedProduct.defaultPrice != null || selectedProduct.availableQty != null || selectedProduct.inTransitLabel) && (
                        <p className="mt-1 text-xs text-amber-600">
                          {selectedProduct.defaultPrice != null &&
                            `Tentative price: ${formatCurrency(selectedProduct.defaultPrice)} (excl. 7.5% VAT)`}
                          {selectedProduct.defaultPrice != null && selectedProduct.availableQty != null && " · "}
                          {selectedProduct.availableQty != null && `Approx. ${selectedProduct.availableQty} unit(s) available`}
                          {selectedProduct.inTransitLabel && ` · ${selectedProduct.inTransitLabel}`}
                        </p>
                      )}
                    </div>
                    <div className="w-20">
                      <input
                        type="number"
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
                  );
                })}
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
            <label
              className={`ml-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-1.5 transition-colors ${uploading ? "opacity-60" : ""}`}
            >
              <Upload className="h-4 w-4" />
              {uploading ? "Reading…" : "Upload from Excel"}
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) uploadSheet(f);
                }}
              />
            </label>
            <a
              href={dealId ? `/deals/won-items-template?deal=${dealId}` : "/deals/won-items-template"}
              download
              className="ml-3 text-xs text-slate-500 hover:text-slate-800"
            >
              {dealId && initialItems.length ? "Download current list (.xlsx)" : "Download template"}
            </a>
            <p className="mt-1 text-xs text-slate-400">
              Sheet columns: Date, Invoice No, Company (Sakuragi / Somotex - Sakuragi if left blank), Item Code, Item Name, Quantity, Rate (excl. VAT).
              Leave Date and Invoice No blank if it isn&apos;t billed yet.
              Uploading replaces the list above.
            </p>
            {uploadNote && <p className="mt-1 text-xs text-slate-600">{uploadNote}</p>}
            {sheetInvoices.length > 0 && (
              <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                <p className="font-medium">
                  {sheetInvoices.length} invoice{sheetInvoices.length === 1 ? "" : "s"} in the sheet - on save this deal is marked Won with{" "}
                  {sheetInvoices.length === 1 ? "it" : "them"}
                  {sheetInvoices.length > 1 ? " (the first stays on this deal, each other one becomes its own won deal)" : ""}:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {sheetInvoices.map((inv) => (
                    <li key={`${inv.company}|${inv.type}|${inv.invoiceNo}`}>
                      {inv.type === "return" ? "Sales return" : "Invoice"} {inv.invoiceNo} · {inv.company || <span className="text-red-600">no company</span>} · {inv.closedAt ? new Date(`${inv.closedAt}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : <span className="text-red-600">no date</span>} ·{" "}
                      {inv.rows.length} line{inv.rows.length === 1 ? "" : "s"} · {formatCurrency(inv.rows.reduce((t, r) => t + r.qty * r.unitPrice, 0))}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setSheetInvoices([])} className="mt-1 font-medium underline">
                  Don&apos;t mark Won - just keep the products
                </button>
              </div>
            )}
            {validItems.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Products total: <span className="font-medium text-slate-700">{formatCurrency(itemsTotal(validItems))}</span>
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Account</label>
          <SearchableSelect
            name="accountId"
            options={accounts}
            defaultValue={accountId}
            onSelect={handleAccountChange}
            placeholder="Type to search accounts..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Contact</label>
          <SearchableSelect
            name="contactId"
            options={visibleContacts}
            value={contactId}
            onSelect={handleContactSelect}
            placeholder="Type to search contacts..."
          />
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

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Tags</label>
          <TagInput defaultValue={defaultValues?.tags ?? []} />
        </div>
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}
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
