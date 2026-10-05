"use client";

import { useActionState } from "react";
import { importStockReceipts, type BulkReceiptState } from "./actions";

export function BulkReceiptForm({ today }: { today: string }) {
  const [state, action, isPending] = useActionState<BulkReceiptState, FormData>(importStockReceipts, {});
  const s = state.summary;

  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Excel file</label>
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:px-4 file:py-2 file:text-sm file:font-medium file:cursor-pointer"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Date for rows left blank</label>
          <input
            type="date"
            name="defaultDate"
            defaultValue={today}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {isPending ? "Uploading…" : "Upload"}
        </button>
        <a href="/stock/receipts-template" className="text-sm text-indigo-600 hover:text-indigo-700 pb-2">
          Download template
        </a>
      </form>

      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{state.error}</p>
      )}

      {s && (
        <div className="rounded-lg border border-slate-200 p-4 space-y-2 text-sm">
          <p className="text-slate-800">
            <span className="font-semibold">{s.receiptsAdded}</span> arrival{s.receiptsAdded === 1 ? "" : "s"} added (
            {s.unitsAdded} unit{s.unitsAdded === 1 ? "" : "s"}) from {s.rowsRead} row{s.rowsRead === 1 ? "" : "s"}
            {s.pricesUpdated > 0 && <>, {s.pricesUpdated} dealer&apos;s price{s.pricesUpdated === 1 ? "" : "s"} updated</>}.
          </p>
          {s.zeroQtyRows > 0 && (
            <p className="text-slate-500">
              Skipped {s.zeroQtyRows} row{s.zeroQtyRows === 1 ? "" : "s"} with no quantity (blank or 0).
            </p>
          )}
          {s.alreadyRecorded > 0 && (
            <p className="text-slate-500">
              Skipped {s.alreadyRecorded} row{s.alreadyRecorded === 1 ? "" : "s"} already recorded (same item, date and quantity).
            </p>
          )}
          {s.productsCreated.length > 0 && (
            <p className="text-slate-500">New products created: {s.productsCreated.join(", ")}</p>
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
