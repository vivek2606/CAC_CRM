"use client";

import { useActionState } from "react";
import { importSalesRegister, type ImportState } from "./actions";
import { formatCompactCurrency } from "@/lib/format";
import { Card } from "@/components/ui";

const initialState: ImportState = {};

export function ImportForm() {
  const [state, formAction, isPending] = useActionState(importSalesRegister, initialState);

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
          {isPending ? "Importing… this can take a minute" : "Import"}
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
                <dt className="text-slate-500">Accounts</dt>
                <dd className="text-lg font-semibold text-slate-800">{state.summary.accountsCreated}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Products</dt>
                <dd className="text-lg font-semibold text-slate-800">{state.summary.productsCreated}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Deals (Won)</dt>
                <dd className="text-lg font-semibold text-slate-800">{state.summary.dealsCreated}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Price entries</dt>
                <dd className="text-lg font-semibold text-slate-800">{state.summary.pricelistEntriesCreated}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Total historical value</dt>
                <dd className="text-lg font-semibold text-slate-800">
                  {formatCompactCurrency(state.summary.totalDealValue)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Inactive historical staff</dt>
                <dd className="text-lg font-semibold text-slate-800">{state.summary.inactiveUsersCreated}</dd>
              </div>
            </dl>
            <p className="text-xs text-slate-400 mt-4">
              Excluded {state.summary.excludedServiceRows} installation/service billing rows and{" "}
              {state.summary.excludedReturnRows} return/credit-note rows.
              {state.summary.skippedFileRows > 0 && ` Skipped ${state.summary.skippedFileRows} blank rows in the file.`}
            </p>
            {state.summary.demoAccountsRemoved.length > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                Removed unused demo accounts: {state.summary.demoAccountsRemoved.join(", ")}
              </p>
            )}
          </Card>

          {state.summary.activeUsers.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-1">New team login credentials</h2>
              <p className="text-xs text-slate-500 mb-3">
                Share these with each person — they should be the only ones who see their own password.
              </p>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 font-medium">Name</th>
                    <th className="py-2 font-medium">Email</th>
                    <th className="py-2 font-medium">Temporary Password</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.summary.activeUsers.map((u) => (
                    <tr key={u.email}>
                      <td className="py-2 text-slate-800">{u.name}</td>
                      <td className="py-2 text-slate-600">{u.email}</td>
                      <td className="py-2 font-mono text-slate-700">{u.tempPassword}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
