"use client";

import { useActionState } from "react";
import { importTargets, type ImportState } from "./actions";
import { formatCompactCurrency } from "@/lib/format";
import { Card } from "@/components/ui";

const initialState: ImportState = {};

export function ImportForm() {
  const [state, formAction, isPending] = useActionState(importTargets, initialState);

  return (
    <div className="space-y-6">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
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
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Import complete</h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-slate-500">Rows read</dt>
                <dd className="text-lg font-semibold text-slate-800">{state.summary.totalRowsIn}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Targets set</dt>
                <dd className="text-lg font-semibold text-slate-800">{state.summary.targetsSet}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Total target value</dt>
                <dd className="text-lg font-semibold text-slate-800">
                  {formatCompactCurrency(state.summary.totalTargetValue)}
                </dd>
              </div>
            </dl>
            {state.summary.skippedFileRows > 0 && (
              <p className="text-xs text-slate-400 mt-4">
                Skipped {state.summary.skippedFileRows} blank/incomplete rows in the file.
              </p>
            )}
            {state.summary.unresolvedNames.length > 0 && (
              <p className="text-xs text-amber-600 mt-3">
                Could not match these names to an active sales rep, so their targets were not saved:{" "}
                {state.summary.unresolvedNames.join(", ")}. Check spelling and re-upload just those rows.
              </p>
            )}
            {state.summary.unparsedMonths.length > 0 && (
              <p className="text-xs text-amber-600 mt-2">
                Could not read these Month values, so those rows were skipped:{" "}
                {state.summary.unparsedMonths.join(", ")}.
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
