"use client";

import { useState, useTransition } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { linkDealAccount } from "./actions";

type Option = { id: string; label: string };

// Shown when a deal must have an account (e.g. to be marked Won) and has
// none: pick any existing account, or create one here and link it.
export function LinkAccountDialog({
  dealId,
  accounts,
  onLinked,
  onCancel,
}: {
  dealId: string;
  accounts: Option[];
  onLinked: () => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  const save = () => {
    setError(null);
    if (mode === "pick" && !accountId) return setError("Pick an account from the list, or create a new one.");
    start(async () => {
      const res = await linkDealAccount(dealId, mode === "pick" ? { accountId } : { name, code, city });
      if (res.error) setError(res.error);
      else onLinked();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-slate-900">Link an account to this deal</h2>
        <p className="mt-1 mb-4 text-xs text-slate-500">A deal needs the customer&apos;s account before it can be marked Won. Pick it from all accounts, or create it if it isn&apos;t there.</p>

        <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1">
          {(
            [
              ["pick", "Choose existing account"],
              ["new", "Create new account"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "pick" ? (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Account</label>
            <SearchableSelect options={accounts} value={accountId} onSelect={(o) => setAccountId(o?.id ?? "")} placeholder="Type to search all accounts…" />
            <p className="mt-2 text-xs text-slate-500">
              Not in the list?{" "}
              <button type="button" onClick={() => setMode("new")} className="font-medium text-indigo-600 hover:text-indigo-700">
                Create it
              </button>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Account name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ROBAN STORES LIMITED" className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Customer code *</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Account code in the ERP" className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Lagos" className={input} />
            </div>
            <p className="sm:col-span-2 text-xs text-slate-500">More details (address, phone, contacts) can be added later from the account page.</p>
          </div>
        )}

        {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
            {pending ? "Saving…" : mode === "pick" ? "Link account" : "Create & link account"}
          </button>
        </div>
      </div>
    </div>
  );
}
