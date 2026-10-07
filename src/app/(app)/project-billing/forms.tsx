"use client";

import { useActionState, useTransition } from "react";
import { formatCurrency } from "@/lib/format";
import { SearchableSelect } from "@/components/searchable-select";
import {
  addProjectBilling,
  deleteProjectBilling,
  importProjectBilling,
  type BulkProjectBillingState,
  type FormState,
} from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const labelClass = "block text-xs font-medium text-slate-500 mb-1";

export function AddBillingForm({
  owners,
  accounts,
  today,
}: {
  owners: { id: string; name: string; service: boolean }[];
  accounts: { id: string; label: string }[];
  today: string;
}) {
  const [state, action, isPending] = useActionState<FormState, FormData>(addProjectBilling, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Date</label>
          <input type="date" name="date" defaultValue={today} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Sales person</label>
          <select name="ownerId" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Pick…
            </option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.service ? " - service billing" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Invoice no.</label>
          <input name="invoiceNo" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Account</label>
          <SearchableSelect name="accountId" options={accounts} placeholder="Search account…" emptyLabel="none - pick an account" />
        </div>
        <div>
          <label className={labelClass}>Description (optional)</label>
          <input name="description" placeholder="e.g. Installation project" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Amount, ₦ net of VAT (negative for a credit note)</label>
          <input name="value" inputMode="decimal" required className={inputClass} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2"
        >
          {isPending ? "Saving…" : "Add billing"}
        </button>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      </div>
    </form>
  );
}

export function UploadBillingForm() {
  const [state, action, isPending] = useActionState<BulkProjectBillingState, FormData>(importProjectBilling, {});
  const s = state.summary;
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelClass}>Excel file</label>
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:px-4 file:py-2 file:text-sm file:font-medium file:cursor-pointer"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2"
        >
          {isPending ? "Uploading…" : "Upload"}
        </button>
        <a href="/project-billing/template" className="text-sm text-indigo-600 hover:text-indigo-700 pb-2">
          Download template
        </a>
      </form>
      {state.error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{state.error}</p>}
      {s && (
        <div className="rounded-lg border border-slate-200 p-4 space-y-2 text-sm">
          <p className="text-slate-800">
            <span className="font-semibold">{s.added}</span> line{s.added === 1 ? "" : "s"} added from {s.rowsRead} row
            {s.rowsRead === 1 ? "" : "s"}
            {s.added > 0 && s.alreadyRecorded === 0 && <> ({formatCurrency(s.total)})</>}.
          </p>
          {s.alreadyRecorded > 0 && (
            <p className="text-slate-500">Skipped {s.alreadyRecorded} already uploaded (same date, invoice, customer, sales person and amount).</p>
          )}
          {s.problems.length > 0 && (
            <div>
              <p className="font-medium text-amber-700">
                {s.problems.length} row{s.problems.length === 1 ? "" : "s"} not imported - fix and upload again:
              </p>
              <ul className="mt-1 list-disc list-inside text-amber-700 space-y-0.5">
                {s.problems.slice(0, 30).map((p) => (
                  <li key={p.rowNumber}>
                    Row {p.rowNumber}: {p.problem}
                  </li>
                ))}
                {s.problems.length > 30 && <li>…and {s.problems.length - 30} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DeleteBillingButton({ id, label }: { id: string; label: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (window.confirm(`Delete ${label}?`)) startTransition(() => deleteProjectBilling(id));
      }}
      className="text-xs text-rose-600 hover:text-rose-700 disabled:opacity-60"
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
