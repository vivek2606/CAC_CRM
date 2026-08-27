"use client";

import { useActionState } from "react";
import { importPriceMaster, type ImportState } from "./actions";
import { Card } from "@/components/ui";

const initialState: ImportState = {};

export function ImportForm() {
  const [state, formAction, isPending] = useActionState(importPriceMaster, initialState);

  return (
    <div className="space-y-6">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Month this price list applies to</label>
          <input
            type="month"
            name="month"
            required
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls"
          required
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:px-4 file:py-2 file:text-sm file:font-medium file:cursor-pointer"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {isPending ? "Importing…" : "Import"}
        </button>
      </form>

      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{state.error}</p>
      )}

      {state.summary && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Import complete</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Rows read</dt>
              <dd className="text-lg font-semibold text-slate-800">{state.summary.totalRowsIn}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Products created/updated</dt>
              <dd className="text-lg font-semibold text-slate-800">{state.summary.productsUpserted}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Prices set for this month</dt>
              <dd className="text-lg font-semibold text-slate-800">{state.summary.priceEntriesSet}</dd>
            </div>
          </dl>
          {state.summary.skippedFileRows > 0 && (
            <p className="text-xs text-slate-400 mt-4">
              Skipped {state.summary.skippedFileRows} blank/incomplete rows in the file.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
