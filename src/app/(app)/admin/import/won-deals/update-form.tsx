"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { checkWonDealUpdates, applyWonDealUpdates, type WonUpdateResult } from "./actions";
import { Card } from "@/components/ui";

// The file is kept here (not in a form that resets after submitting), so
// the same sheet can be checked and then applied.
export function UpdateForm() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<WonUpdateResult | null>(null);
  const [checked, setChecked] = useState(false);
  const [pending, start] = useTransition();

  const send = (apply: boolean) =>
    start(async () => {
      if (!file) return;
      const fd = new FormData();
      fd.set("file", file);
      const r = await (apply ? applyWonDealUpdates(fd) : checkWonDealUpdates(fd));
      setResult(r);
      setChecked(!apply && !r.error);
    });

  const plans = result?.plans ?? [];
  const withChanges = plans.filter((p) => !p.problem && p.changes.length > 0);
  const unchanged = plans.filter((p) => !p.problem && p.changes.length === 0);
  const problems = plans.filter((p) => p.problem);
  const rowProblems = result?.rowProblems ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setChecked(false);
          }}
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:px-4 file:py-2 file:text-sm file:font-medium file:cursor-pointer"
        />
        <button
          type="button"
          disabled={!file || pending}
          onClick={() => send(false)}
          className="rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-sm font-medium px-4 py-2 transition-colors"
        >
          {pending && !checked ? "Checking…" : "Check"}
        </button>
        <button
          type="button"
          disabled={!file || pending || !checked || withChanges.length === 0}
          onClick={() => send(true)}
          title={!checked ? "Check the sheet first" : undefined}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {pending && checked ? "Applying…" : `Apply${checked && withChanges.length ? ` ${withChanges.length} update${withChanges.length === 1 ? "" : "s"}` : ""}`}
        </button>
      </div>

      {result?.error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{result.error}</p>}

      {result && !result.error && (
        <div className="space-y-4">
          <p
            className={`text-sm rounded-lg px-4 py-3 border ${
              result.applied ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-indigo-50 border-indigo-200 text-indigo-900"
            }`}
          >
            {result.applied
              ? `Done - ${withChanges.length} won deal${withChanges.length === 1 ? "" : "s"} updated.`
              : `Checked - ${withChanges.length} deal${withChanges.length === 1 ? "" : "s"} to update, ${unchanged.length} already up to date, ${problems.length + rowProblems.length} problem${
                  problems.length + rowProblems.length === 1 ? "" : "s"
                }. Nothing has been saved yet.`}
          </p>

          {(problems.length > 0 || rowProblems.length > 0) && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-amber-700 mb-2">Not updated</h2>
              <ul className="text-sm text-slate-700 space-y-1">
                {rowProblems.map((p, i) => (
                  <li key={`r${i}`}>
                    <span className="text-slate-400">Row {p.rowNumber}:</span> {p.problem}
                  </li>
                ))}
                {problems.map((p, i) => (
                  <li key={`p${i}`}>
                    <span className="text-slate-400">
                      Invoice {p.invoiceNo}
                      {p.company ? ` (${p.company})` : ""}, row{p.rows.length > 1 ? "s" : ""} {p.rows.join(", ")}:
                    </span>{" "}
                    {p.problem}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {withChanges.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">{result.applied ? "Updated" : "Will be updated"}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide">
                      <th className="px-2 py-1.5 font-medium">Invoice</th>
                      <th className="px-2 py-1.5 font-medium">Deal</th>
                      <th className="px-2 py-1.5 font-medium">Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withChanges.map((p) => (
                      <tr key={p.dealId} className="border-t border-slate-100 align-top">
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {p.invoiceNo}
                          {p.company && <span className="text-slate-400"> ({p.company})</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          <Link href={`/deals/${p.dealId}`} className="text-indigo-700 hover:underline">
                            {p.dealTitle}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5">
                          <ul className="space-y-0.5 text-xs text-slate-700">
                            {p.changes.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {unchanged.length > 0 && (
            <p className="text-xs text-slate-500">
              Already matching the sheet: {unchanged.map((p) => p.invoiceNo).join(", ")}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
