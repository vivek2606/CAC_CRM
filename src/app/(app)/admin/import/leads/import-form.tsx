"use client";

import { useActionState } from "react";
import { importLeadsRegister, type ImportState } from "./actions";
import { formatCompactCurrency } from "@/lib/format";
import { Card } from "@/components/ui";

const initialState: ImportState = {};

export function ImportForm() {
  const [state, formAction, isPending] = useActionState(importLeadsRegister, initialState);

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
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Import complete</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Leads</dt>
              <dd className="text-lg font-semibold text-slate-800">{state.summary.leadsCreated}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Accounts</dt>
              <dd className="text-lg font-semibold text-slate-800">{state.summary.accountsCreated}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Contacts</dt>
              <dd className="text-lg font-semibold text-slate-800">{state.summary.contactsCreated}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Total lead value</dt>
              <dd className="text-lg font-semibold text-slate-800">{formatCompactCurrency(state.summary.totalLeadValue)}</dd>
            </div>
          </dl>
          <p className="text-xs text-slate-400 mt-4">
            Hot: {state.summary.hotCount} · Warm: {state.summary.warmCount} · Cold: {state.summary.coldCount} · Lost:{" "}
            {state.summary.lostCount}
            {state.summary.excludedWonRows > 0 &&
              ` · Skipped ${state.summary.excludedWonRows} row(s) marked Won in the sheet (these come in later via the Sales Register import instead).`}
            {state.summary.leadsReplaced > 0 &&
              ` · Replaced ${state.summary.leadsReplaced} leads from a previous run of this import.`}
            {state.summary.skippedFileRows > 0 && ` · Skipped ${state.summary.skippedFileRows} blank rows in the file.`}
          </p>
          {state.summary.unresolvedOwners.length > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              Couldn&apos;t match sales rep(s) for: {state.summary.unresolvedOwners.join(", ")} — assigned to you instead.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
